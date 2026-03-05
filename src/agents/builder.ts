// OSSFactory-Scaler — Builder agent: clone, upgrade, repair cascade, push release

import type { WorkItem, RepoBuildContext } from "../types";
import { chat, cascadeChat } from "../model-router";
import { cloneRepo, getReadme, getPackageJson, listSourceFiles, listTestFiles, commitAndPush, createRelease } from "../github-client";
import { pickNextWork, completeWork, failWork } from "../state";
import { checkShipReady } from "../quality-gates";
import { award } from "../slicing-pie";
import { isBudgetExhausted, getRemainingBudget } from "../token-tracker";

async function exec(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bash", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

async function buildContext(repoName: string): Promise<RepoBuildContext> {
  const cloneDir = await cloneRepo(repoName);
  const readme = await getReadme(repoName, cloneDir);
  const packageJson = await getPackageJson(cloneDir);
  const sourceFiles = await listSourceFiles(cloneDir);
  const testFiles = await listTestFiles(cloneDir);
  const currentVersion = (packageJson as any)?.version ?? "0.1.0";

  return { repoName, cloneDir, packageJson, sourceFiles, testFiles, readme, currentVersion };
}

function bumpVersion(version: string): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3) return "0.2.0";
  parts[2]++;
  return parts.join(".");
}

async function readFiles(cloneDir: string, files: string[]): Promise<string> {
  const contents: string[] = [];
  for (const f of files.slice(0, 5)) {
    const { stdout } = await exec(`cat "${f}" 2>/dev/null | head -200`, cloneDir);
    if (stdout) contents.push(`--- ${f} ---\n${stdout}`);
  }
  return contents.join("\n\n");
}

async function generateUpgrade(ctx: RepoBuildContext, workItem: WorkItem): Promise<{ file: string; content: string }[] | null> {
  const sourceContent = await readFiles(ctx.cloneDir, ctx.sourceFiles);

  const resp = await cascadeChat(
    [
      {
        role: "system",
        content: `You are an expert TypeScript/Bun developer. Generate code upgrades for OSS repos.
Rules:
- ZERO external npm dependencies — ONLY Node/Bun built-ins
- Return ONLY a JSON array of {file, content} objects
- No prose, no markdown fences, just the JSON array
- Keep changes focused and minimal
- Preserve existing functionality
- Use TypeScript with proper types`,
      },
      {
        role: "user",
        content: `Repo: ${ctx.repoName} (v${ctx.currentVersion})
Task: ${workItem.description}
Type: ${workItem.type}

Current source files:
${sourceContent}

README excerpt:
${ctx.readme.slice(0, 500)}

Generate the upgrade. Return JSON array of {file, content} objects.`,
      },
    ],
    "builder",
    `upgrade-${ctx.repoName}`,
    (content) => {
      try {
        const match = content.match(/\[[\s\S]*\]/);
        if (!match) return false;
        const arr = JSON.parse(match[0]);
        return Array.isArray(arr) && arr.length > 0 && arr.every((f: any) => f.file && f.content);
      } catch {
        return false;
      }
    },
    8192,
  );

  if (!resp) return null;

  const match = resp.content.match(/\[[\s\S]*\]/);
  if (!match) return null;
  return JSON.parse(match[0]);
}

async function applyFiles(cloneDir: string, files: { file: string; content: string }[]): Promise<void> {
  for (const { file, content } of files) {
    const dir = file.includes("/") ? file.substring(0, file.lastIndexOf("/")) : null;
    if (dir) await exec(`mkdir -p "${dir}"`, cloneDir);
    await Bun.write(`${cloneDir}/${file}`, content);
  }
}

export async function runBuilder(): Promise<{ attempted: string | null; result: "shipped" | "failed" | "skipped" }> {
  if (isBudgetExhausted()) {
    console.log("[builder] Budget exhausted, skipping");
    return { attempted: null, result: "skipped" };
  }

  if (getRemainingBudget() < 0.10) {
    console.log("[builder] Budget too low for build, skipping");
    return { attempted: null, result: "skipped" };
  }

  const workItem = pickNextWork();
  if (!workItem) {
    console.log("[builder] No work items in queue");
    return { attempted: null, result: "skipped" };
  }

  console.log(`[builder] Building: ${workItem.repo} — ${workItem.description}`);

  try {
    const ctx = await buildContext(workItem.repo);
    const files = await generateUpgrade(ctx, workItem);

    if (!files || files.length === 0) {
      failWork(workItem.id, "No upgrade generated");
      award("builder", "failed-ship", `Failed to generate upgrade for ${workItem.repo}`);
      return { attempted: workItem.repo, result: "failed" };
    }

    await applyFiles(ctx.cloneDir, files);

    const shipCheck = await checkShipReady(ctx.cloneDir);
    console.log(`[builder] Ship readiness: ${shipCheck.compositeScore}/100`);

    if (!shipCheck.ready) {
      failWork(workItem.id, `Quality gates failed: ${shipCheck.compositeScore}/100`);
      award("builder", "failed-ship", `${workItem.repo} scored ${shipCheck.compositeScore}/100`);
      return { attempted: workItem.repo, result: "failed" };
    }

    const newVersion = bumpVersion(ctx.currentVersion);
    if (ctx.packageJson) {
      const pkg = { ...ctx.packageJson, version: newVersion };
      await Bun.write(`${ctx.cloneDir}/package.json`, JSON.stringify(pkg, null, 2));
    }

    const commitMsg = `v${newVersion}: ${workItem.description}`;
    const pushed = await commitAndPush(ctx.cloneDir, commitMsg);
    if (!pushed) {
      failWork(workItem.id, "Git push failed");
      award("builder", "failed-ship", `Push failed for ${workItem.repo}`);
      return { attempted: workItem.repo, result: "failed" };
    }

    await createRelease(
      workItem.repo,
      `v${newVersion}`,
      `v${newVersion}`,
      workItem.description,
      ctx.cloneDir,
    );

    completeWork(workItem.id, `Shipped v${newVersion}`);
    award("builder", "ship-release", `Shipped ${workItem.repo} v${newVersion}`);
    console.log(`[builder] Shipped ${workItem.repo} v${newVersion}`);

    return { attempted: workItem.repo, result: "shipped" };
  } catch (err) {
    failWork(workItem.id, (err as Error).message);
    award("builder", "failed-ship", `${workItem.repo}: ${(err as Error).message}`);
    return { attempted: workItem.repo, result: "failed" };
  }
}
