// OSSFactory-Scaler — Builder agent: clone, upgrade, repair cascade, push release
// Phase 1: repair loop (up to 2 retries), test destruction guard
// Phase 2: test-driven repair, per-build budget cap ($0.30)
// Phase 3: inspiration injection from feedback store, prompt evolution rules

import type { WorkItem, RepoBuildContext, BuildResult, BuildFeedback } from "../types";
import { cascadeChat } from "../model-router";
import { cloneRepo, getReadme, getPackageJson, listSourceFiles, listTestFiles, commitAndPush, createRelease } from "../github-client";
import { pickNextWork, completeWork, failWork } from "../state";
import { checkShipReady } from "../quality-gates";
import { award } from "../slicing-pie";
import { isBudgetExhausted, getRemainingBudget, getBuildSpend, resetBuildSpend } from "../token-tracker";
import { recordBuild, getRecentSuccesses } from "../feedback-store";
import { formatRulesForPrompt, onBuildSuccess, onBuildFailure } from "../prompt-evolution";
import { getCriticHints } from "./critic";
import { tickBuild } from "../improve-cycle";

const MAX_REPAIR_PASSES = 2;
const PER_BUILD_BUDGET = 0.30;

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

function countTestPatterns(files: { file: string; content: string }[]): number {
  let count = 0;
  for (const f of files) {
    if (f.file.includes("test") || f.file.includes("spec")) {
      const matches = f.content.match(/\b(it|test|describe)\s*\(/g);
      count += matches?.length ?? 0;
    }
  }
  return count;
}

function buildInspirationContext(): string {
  const successes = getRecentSuccesses(3);
  if (successes.length === 0) return "";
  return "\n\nRecent successful upgrades (for reference):\n" +
    successes.map(s => `- ${s.repo}: ${s.description} (${s.workType})`).join("\n");
}

function buildCriticContext(): string {
  const hints = getCriticHints();
  if (hints.length === 0) return "";
  return "\n\nCritic hints (avoid these patterns):\n" +
    hints.map(h => `- ${h.rule}`).join("\n");
}

async function generateUpgrade(
  ctx: RepoBuildContext,
  workItem: WorkItem,
  repairContext?: string,
): Promise<{ file: string; content: string }[] | null> {
  const sourceContent = await readFiles(ctx.cloneDir, ctx.sourceFiles);
  const inspiration = buildInspirationContext();
  const criticHints = buildCriticContext();
  const promptRules = formatRulesForPrompt();

  const repairInstructions = repairContext
    ? `\n\nPREVIOUS ATTEMPT FAILED. Fix these specific issues:\n${repairContext}\n\nDo NOT repeat the same mistakes. If tests failed with wrong expected values, fix the EXPECTED values in tests (not the source code).`
    : "";

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
- Use TypeScript with proper types${inspiration}${criticHints}${promptRules}`,
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
${repairInstructions}
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

function formatGateErrors(gates: { gate: string; passed: boolean; score: number; details: string }[]): string {
  return gates
    .filter(g => !g.passed)
    .map(g => `${g.gate}: FAIL (${g.score}/100) — ${g.details}`)
    .join("\n");
}

export async function runBuilder(inFlightNames?: Set<string>): Promise<BuildResult> {
  if (isBudgetExhausted()) {
    console.log("[builder] Budget exhausted, skipping");
    return { attempted: null, result: "skipped" };
  }

  if (getRemainingBudget() < 0.10) {
    console.log("[builder] Budget too low for build, skipping");
    return { attempted: null, result: "skipped" };
  }

  const workItem = pickNextWork(inFlightNames);
  if (!workItem) {
    console.log("[builder] No work items in queue");
    return { attempted: null, result: "skipped" };
  }

  const startTime = Date.now();
  resetBuildSpend();
  console.log(`[builder] Building: ${workItem.repo} — ${workItem.description}`);

  try {
    const ctx = await buildContext(workItem.repo);
    let files = await generateUpgrade(ctx, workItem);

    if (!files || files.length === 0) {
      failWork(workItem.id, "No upgrade generated");
      award("builder", "failed-ship", `Failed to generate upgrade for ${workItem.repo}`);
      recordBuildFeedback(workItem, "failed", 0, startTime, "No upgrade generated");
      return { attempted: workItem.repo, result: "failed", repairPasses: 0 };
    }

    // Count original test patterns for destruction guard
    const originalTestCount = countTestPatterns(files);
    await applyFiles(ctx.cloneDir, files);

    let shipCheck = await checkShipReady(ctx.cloneDir);
    let repairPass = 0;
    console.log(`[builder] Ship readiness: ${shipCheck.compositeScore}/100`);

    // Repair loop: retry up to MAX_REPAIR_PASSES times with error context
    while (!shipCheck.ready && repairPass < MAX_REPAIR_PASSES) {
      repairPass++;
      console.log(`[builder] Repair pass ${repairPass}/${MAX_REPAIR_PASSES}...`);

      // Per-build budget guard
      if (getBuildSpend() >= PER_BUILD_BUDGET) {
        console.log(`[builder] Per-build budget cap ($${PER_BUILD_BUDGET}) reached, stopping repairs`);
        break;
      }

      const gateErrors = formatGateErrors(shipCheck.gates);
      const repairFiles = await generateUpgrade(ctx, workItem, gateErrors);

      if (!repairFiles || repairFiles.length === 0) {
        console.log("[builder] Repair generated no files, keeping original");
        break;
      }

      // Test destruction guard: if repair produces 0 test patterns when original had some, reject
      const repairTestCount = countTestPatterns(repairFiles);
      if (originalTestCount > 0 && repairTestCount === 0) {
        console.log("[builder] Repair destroyed all tests, keeping original");
        break;
      }

      await applyFiles(ctx.cloneDir, repairFiles);
      shipCheck = await checkShipReady(ctx.cloneDir);
      console.log(`[builder] After repair ${repairPass}: ${shipCheck.compositeScore}/100`);
    }

    if (!shipCheck.ready) {
      const gateDetails = formatGateErrors(shipCheck.gates);
      failWork(workItem.id, `Quality gates failed: ${shipCheck.compositeScore}/100`);
      award("builder", "failed-ship", `${workItem.repo} scored ${shipCheck.compositeScore}/100`);
      onBuildFailure(workItem.type, gateDetails);
      recordBuildFeedback(workItem, "failed", repairPass, startTime, gateDetails);
      return { attempted: workItem.repo, result: "failed", repairPasses: repairPass, gateDetails };
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
      recordBuildFeedback(workItem, "failed", repairPass, startTime, "Git push failed");
      return { attempted: workItem.repo, result: "failed", repairPasses: repairPass };
    }

    await createRelease(workItem.repo, `v${newVersion}`, `v${newVersion}`, workItem.description, ctx.cloneDir);

    completeWork(workItem.id, `Shipped v${newVersion}`);
    award("builder", "ship-release", `Shipped ${workItem.repo} v${newVersion}`);
    onBuildSuccess(workItem.type, workItem.description);
    recordBuildFeedback(workItem, "shipped", repairPass, startTime, "");
    tickBuild();
    console.log(`[builder] Shipped ${workItem.repo} v${newVersion}`);

    return { attempted: workItem.repo, result: "shipped", repairPasses: repairPass, costUsd: getBuildSpend(), wallTimeMs: Date.now() - startTime };
  } catch (err) {
    failWork(workItem.id, (err as Error).message);
    award("builder", "failed-ship", `${workItem.repo}: ${(err as Error).message}`);
    recordBuildFeedback(workItem, "failed", 0, startTime, (err as Error).message);
    return { attempted: workItem.repo, result: "failed" };
  }
}

function recordBuildFeedback(workItem: WorkItem, result: "shipped" | "failed" | "skipped", repairPasses: number, startTime: number, gateDetails: string): void {
  recordBuild({
    timestamp: new Date().toISOString(),
    repo: workItem.repo,
    workType: workItem.type,
    result,
    gateDetails,
    repairPasses,
    costUsd: getBuildSpend(),
    wallTimeMs: Date.now() - startTime,
    tier: "fast",
    description: workItem.description,
  });
}
