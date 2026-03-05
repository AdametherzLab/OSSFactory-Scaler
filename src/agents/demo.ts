// OSSFactory-Scaler — Demo agent: create/update SEO demo pages, deploy to VPS

import type { DemoPageConfig } from "../types";
import { chat } from "../model-router";
import { loadState } from "../state";
import { generateDemoPage } from "../templates/demo-page";
import { award } from "../slicing-pie";
import { VPS_HOST, VPS_USER, SSH_KEY_PATH, DEMO_DEPLOY_PATH, GITHUB_ORG } from "../config";

const THEMES = ["dark", "forest", "ocean", "sunset", "light"] as const;

function pickTheme(repoName: string): DemoPageConfig["theme"] {
  let hash = 0;
  for (let i = 0; i < repoName.length; i++) {
    hash = (hash * 31 + repoName.charCodeAt(i)) | 0;
  }
  return THEMES[Math.abs(hash) % THEMES.length];
}

async function generateDemoConfig(repoName: string): Promise<DemoPageConfig | null> {
  const state = loadState();
  const audit = state.repoAudits.find(a => a.name === repoName);
  if (!audit) return null;

  try {
    const resp = await chat(
      [
        {
          role: "system",
          content: `You generate demo page config for OSS repos. Return a JSON object with:
- title: SEO-friendly title under 60 chars, format "[Search Intent] | Free [Type]"
- description: 1-2 sentence description for meta tags
- features: array of 3-5 feature strings
- installCmd: npm/bun install command
- usageExample: 3-8 line code example

Return ONLY the JSON object, no markdown, no prose.`,
        },
        {
          role: "user",
          content: `Repo: ${repoName}\nDescription: ${audit.description}\nVersion: ${audit.version}\nGenerate demo page config.`,
        },
      ],
      "fast",
      "demo",
      `demo-config-${repoName}`,
      1024,
    );

    const match = resp.content.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    return {
      repoName,
      title: parsed.title ?? repoName,
      description: parsed.description ?? audit.description,
      repoUrl: `https://github.com/${GITHUB_ORG}/${repoName}`,
      features: parsed.features ?? [],
      installCmd: parsed.installCmd ?? `bun add ${repoName}`,
      usageExample: parsed.usageExample ?? `import { } from "${repoName}";`,
      theme: pickTheme(repoName),
    };
  } catch (err) {
    console.error(`[demo] Config generation failed for ${repoName}:`, (err as Error).message);
    return null;
  }
}

async function deployToVps(fileName: string, content: string): Promise<boolean> {
  if (!VPS_HOST || !VPS_USER) {
    console.log("[demo] VPS not configured, skipping deploy");
    return false;
  }

  try {
    const tmpFile = `/tmp/oss-demo-${fileName}`;
    await Bun.write(tmpFile, content);

    const sshOpts = SSH_KEY_PATH ? `-i "${SSH_KEY_PATH}"` : "";
    const scpCmd = `scp ${sshOpts} -o StrictHostKeyChecking=no "${tmpFile}" ${VPS_USER}@${VPS_HOST}:${DEMO_DEPLOY_PATH}/${fileName}`;

    const proc = Bun.spawn(["bash", "-c", scpCmd], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.error(`[demo] SCP failed: ${stderr}`);
      return false;
    }

    console.log(`[demo] Deployed ${fileName} to VPS`);
    return true;
  } catch (err) {
    console.error(`[demo] Deploy error:`, (err as Error).message);
    return false;
  }
}

export async function runDemo(): Promise<{ created: string | null; updated: string | null }> {
  const state = loadState();
  const recentShips = state.completedWork
    .filter(w => w.status === "completed" && w.result?.startsWith("Shipped"))
    .slice(-5);

  if (recentShips.length === 0) {
    console.log("[demo] No recent ships to create demos for");
    return { created: null, updated: null };
  }

  const repo = recentShips[recentShips.length - 1].repo;
  console.log(`[demo] Generating demo page for ${repo}`);

  const config = await generateDemoConfig(repo);
  if (!config) {
    console.log("[demo] Could not generate config");
    return { created: null, updated: null };
  }

  const html = generateDemoPage(config);
  const fileName = `${repo}.html`;

  const deployed = await deployToVps(fileName, html);
  if (deployed) {
    award("demo", "create-demo", `Created demo for ${repo}`);
    return { created: repo, updated: null };
  }

  await Bun.write(`data/demo-${fileName}`, html);
  award("demo", "create-demo", `Generated demo for ${repo} (local)`);
  return { created: repo, updated: null };
}
