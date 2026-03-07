// OSSFactory-Scaler — Demo agent: create interactive technology demo pages
// RULE: Every shipped repo MUST have a demo page. No exceptions.
// Pages must be INTERACTIVE — calculators, tools, live inputs — not static brochures.

import type { DemoPageConfig } from "../types";
import { chat, cascadeChat } from "../model-router";
import { loadState } from "../state";
import { generateDemoPage } from "../templates/demo-page";
import { award } from "../slicing-pie";
import { cloneRepo, getReadme, listSourceFiles } from "../github-client";
import { VPS_HOST, VPS_USER, SSH_KEY_PATH, DEMO_DEPLOY_PATH, GITHUB_ORG, DATA_DIR } from "../config";
import { existsSync, readFileSync, renameSync } from "fs";
import { join } from "path";

const DEMO_TRACKER_FILE = join(DATA_DIR, "demo-tracker.json");

interface DemoTracker {
  deployed: Record<string, { deployedAt: string; version: string; url: string }>;
}

function loadDemoTracker(): DemoTracker {
  if (!existsSync(DEMO_TRACKER_FILE)) return { deployed: {} };
  try {
    return JSON.parse(readFileSync(DEMO_TRACKER_FILE, "utf-8"));
  } catch {
    return { deployed: {} };
  }
}

function saveDemoTracker(tracker: DemoTracker): void {
  const tmp = DEMO_TRACKER_FILE + ".tmp";
  Bun.write(tmp, JSON.stringify(tracker, null, 2));
  renameSync(tmp, DEMO_TRACKER_FILE);
}

async function readSourceFiles(cloneDir: string, files: string[]): Promise<string> {
  const contents: string[] = [];
  for (const f of files.slice(0, 5)) {
    try {
      const proc = Bun.spawn(["bash", "-c", `cat "${f}" 2>/dev/null | head -150`], { cwd: cloneDir, stdout: "pipe", stderr: "pipe" });
      const text = (await new Response(proc.stdout).text()).trim();
      if (text) contents.push(`--- ${f} ---\n${text}`);
    } catch {}
  }
  return contents.join("\n\n");
}

async function generateInteractiveBody(repoName: string, description: string, readme: string, sourceCode: string): Promise<string | null> {
  const resp = await cascadeChat(
    [
      {
        role: "system",
        content: `You are a frontend developer creating INTERACTIVE demo pages for OSS libraries.

Your job: generate the HTML body content (everything inside <main>...</main>) for a technology demo page.

The page uses a Flower of Life glassmorphism design system with Inter + JetBrains Mono fonts. All CSS is already defined.

CRITICAL RULES:
1. The page must be INTERACTIVE — calculators, converters, live tools that demonstrate the library's functionality
2. Generate 2-4 interactive sections with form inputs, calculate buttons, and result displays
3. Include working JavaScript that performs real calculations/conversions related to the library's purpose
4. Use these CSS classes (already defined in the page shell):
   - .glass-card — glassmorphism card wrapper for each tool section (use this for ALL section wrappers)
   - .card-title — uppercase accent-colored section header inside a glass-card
   - .output-card > .output-body — monospace output/results area
   - .output-header — header row inside output-card (with label + optional copy button)
   - .badge-btn — pill-shaped badge links
   - .data-table / th / td — styled data tables with accent headers
   - .pane-grid — 2-column responsive grid layout
   - .form-row — flex row for side-by-side form fields
   - .warning-box — warning/caution callout box
   - .btn — pill-shaped outline button; .btn-primary — filled accent button
   - .copy-btn — small copy-to-clipboard button
   - label — uppercase accent label (already styled)
   - input / select / textarea — already styled with JetBrains Mono + glow on focus
   - pre > code — styled code blocks
5. Do NOT include an h1 — the header with title is already in the page shell
6. Include an "Install & Quick Start" section with install command and code example in <pre><code>
7. End with a features/reference section
8. All JavaScript must be inline in <script> tags at the end
9. Make calculations ACCURATE — use real formulas relevant to the library's domain
10. Return ONLY the raw HTML (no markdown fences, no \`\`\`html, no prose before/after)

EXAMPLE STRUCTURE (for a unit converter library):
<div class="glass-card">
  <div class="card-title">Temperature Converter</div>
  <div class="form-row">
    <div>
      <label for="celsius">Celsius</label>
      <input type="number" id="celsius" value="100">
    </div>
    <div>
      <label>&nbsp;</label>
      <button class="btn btn-primary" onclick="convertTemp()">Convert</button>
    </div>
  </div>
  <div class="output-card" style="margin-top:0.75rem;">
    <div class="output-header"><span>Result</span></div>
    <div class="output-body" id="tempResult">Fahrenheit: 212</div>
  </div>
</div>

<div class="glass-card">
  <div class="card-title">Install &amp; Quick Start</div>
  <pre><code>bun add unit-converter</code></pre>
  <pre><code>import { convert } from "unit-converter";
const f = convert(100, "C", "F"); // 212</code></pre>
</div>

<script>
function convertTemp() { ... }
</script>`,
      },
      {
        role: "user",
        content: `Create an interactive demo page body for this OSS library:

REPO: ${repoName}
DESCRIPTION: ${description}

README (excerpt):
${readme.slice(0, 2000)}

SOURCE CODE (excerpt):
${sourceCode.slice(0, 3000)}

Generate the full interactive HTML body content. Make the tools actually useful — someone should be able to use this page to do real calculations/work related to ${repoName}'s domain.`,
      },
    ],
    "demo",
    `interactive-demo-${repoName}`,
    (content) => {
      // Must contain interactive elements
      const hasInput = content.includes("<input");
      const hasButton = content.includes("<button") || content.includes("onclick");
      const hasScript = content.includes("<script");
      const hasCard = content.includes("glass-card") || content.includes("section");
      return hasInput && hasButton && hasScript && hasCard;
    },
    8192,
  );

  if (!resp) return null;

  // Strip any markdown fences the model might wrap around the HTML
  let body = resp.content;
  body = body.replace(/^```html?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  // Strip any prose before the first HTML tag
  const firstTag = body.indexOf("<");
  if (firstTag > 0) body = body.slice(firstTag);

  return body;
}

async function generateDemoConfig(repoName: string, description: string, version: string): Promise<DemoPageConfig | null> {
  try {
    // Clone and read actual source code for context
    const cloneDir = await cloneRepo(repoName);
    const readme = await getReadme(repoName, cloneDir);
    const sourceFiles = await listSourceFiles(cloneDir);
    const sourceCode = await readSourceFiles(cloneDir, sourceFiles);

    const fullDesc = description || readme.slice(0, 500);

    // Generate SEO title via micro model
    const titleResp = await chat(
      [
        {
          role: "system",
          content: `Return a single JSON object with "title" (SEO-friendly, under 60 chars, format "[Search Intent] | Free [Tool Type]") and "description" (1-2 sentences for meta tags). No markdown, no prose.`,
        },
        {
          role: "user",
          content: `Repo: ${repoName}\nDescription: ${fullDesc.slice(0, 300)}`,
        },
      ],
      "micro",
      "demo",
      `demo-title-${repoName}`,
      256,
    );

    let title = repoName;
    let metaDesc = fullDesc.slice(0, 160);
    try {
      const match = titleResp.content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        title = parsed.title ?? repoName;
        metaDesc = parsed.description ?? metaDesc;
      }
    } catch {}

    // Generate the interactive body content
    const interactiveBody = await generateInteractiveBody(repoName, fullDesc, readme, sourceCode);
    if (!interactiveBody) {
      console.error(`[demo] Failed to generate interactive body for ${repoName}`);
      return null;
    }

    return {
      repoName,
      title,
      description: metaDesc,
      repoUrl: `https://github.com/${GITHUB_ORG}/${repoName}`,
      version,
      interactiveBody,
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
    // If running locally on VPS, just write directly (no SCP needed)
    if (VPS_HOST === "localhost" || VPS_HOST === "127.0.0.1") {
      const { mkdirSync } = await import("fs");
      mkdirSync(DEMO_DEPLOY_PATH, { recursive: true });
      await Bun.write(`${DEMO_DEPLOY_PATH}/${fileName}`, content);
      console.log(`[demo] Deployed ${fileName} locally to ${DEMO_DEPLOY_PATH}/`);
      return true;
    }

    // Remote deploy via SCP
    const tmpFile = `/tmp/oss-demo-${fileName}`;
    await Bun.write(tmpFile, content);
    const sshOpts = SSH_KEY_PATH ? `-i "${SSH_KEY_PATH}"` : "";

    const mkdirCmd = `ssh ${sshOpts} -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_HOST} "mkdir -p ${DEMO_DEPLOY_PATH}"`;
    const mkdirProc = Bun.spawn(["bash", "-c", mkdirCmd], { stdout: "pipe", stderr: "pipe" });
    await mkdirProc.exited;

    const scpCmd = `scp ${sshOpts} -o StrictHostKeyChecking=no "${tmpFile}" ${VPS_USER}@${VPS_HOST}:${DEMO_DEPLOY_PATH}/${fileName}`;
    const proc = Bun.spawn(["bash", "-c", scpCmd], { stdout: "pipe", stderr: "pipe" });
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.error(`[demo] SCP failed: ${stderr}`);
      return false;
    }

    console.log(`[demo] Deployed ${fileName} to VPS via SCP`);
    return true;
  } catch (err) {
    console.error(`[demo] Deploy error:`, (err as Error).message);
    return false;
  }
}

function getShippedReposMissingDemos(): { repo: string; description: string; version: string }[] {
  const state = loadState();
  const tracker = loadDemoTracker();

  // Collect all unique shipped repos with their latest version
  const shippedRepos = new Map<string, { description: string; version: string }>();
  for (const w of state.completedWork) {
    if (w.status === "completed" && w.result?.startsWith("Shipped")) {
      const vMatch = w.result.match(/v([\d.]+)/);
      shippedRepos.set(w.repo, {
        description: w.description,
        version: vMatch ? vMatch[1] : "0.1.0",
      });
    }
  }

  // Filter out repos that already have demos
  const missing: { repo: string; description: string; version: string }[] = [];
  for (const [repo, info] of shippedRepos) {
    if (!tracker.deployed[repo]) {
      missing.push({ repo, ...info });
    }
  }
  return missing;
}

export async function runDemo(): Promise<{ created: string | null; updated: string | null }> {
  const missing = getShippedReposMissingDemos();

  if (missing.length === 0) {
    console.log("[demo] All shipped repos have demo pages");
    return { created: null, updated: null };
  }

  // Create demo for the first missing repo (one per VDay to stay on budget)
  const target = missing[0];
  console.log(`[demo] Creating interactive demo for ${target.repo} (${missing.length} repos missing demos)`);

  // Try to get richer description from audit data
  const state = loadState();
  const audit = state.repoAudits.find(a => a.name === target.repo);
  const description = audit?.description || target.description;

  const config = await generateDemoConfig(target.repo, description, target.version);
  if (!config) {
    console.log("[demo] Could not generate interactive demo");
    return { created: null, updated: null };
  }

  const html = generateDemoPage(config);
  const fileName = `${target.repo}.html`;

  const deployed = await deployToVps(fileName, html);

  // Always save local copy as backup
  await Bun.write(join(DATA_DIR, `demo-${fileName}`), html);

  if (deployed) {
    const tracker = loadDemoTracker();
    tracker.deployed[target.repo] = {
      deployedAt: new Date().toISOString(),
      version: target.version,
      url: `https://che0md.tech/oss/${target.repo}`,
    };
    saveDemoTracker(tracker);

    award("demo", "create-demo", `Created interactive demo for ${target.repo}`);
    console.log(`[demo] Live at https://che0md.tech/oss/${target.repo}`);
    return { created: target.repo, updated: null };
  }

  console.log(`[demo] Saved local copy for ${target.repo} (deploy failed)`);
  return { created: null, updated: null };
}
