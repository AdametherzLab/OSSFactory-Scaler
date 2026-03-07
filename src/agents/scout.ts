// OSSFactory-Scaler — Scout agent: scan repos, audit quality, prioritize work queue
// Phase 3.1: AI-powered feature mining for high-quality repos

import type { RepoAudit } from "../types";
import { chat } from "../model-router";
import { listRepos, getReadme, cloneRepo, getPackageJson, listTestFiles, listSourceFiles } from "../github-client";
import { loadState, saveState, addWorkItem } from "../state";
import { award } from "../slicing-pie";
import { GITHUB_ORG } from "../config";
import { getTypeSuccessRate } from "../feedback-store";

async function exec(cmd: string, cwd: string): Promise<string> {
  const proc = Bun.spawn(["bash", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe" });
  return (await new Response(proc.stdout).text()).trim();
}

async function auditRepo(repoName: string): Promise<RepoAudit | null> {
  try {
    const cloneDir = await cloneRepo(repoName);
    const readme = await getReadme(repoName, cloneDir);
    const pkg = await getPackageJson(cloneDir);
    const testFiles = await listTestFiles(cloneDir);

    const hasLicense = (await exec("test -f LICENSE && echo yes || echo no", cloneDir)) === "yes";
    const hasCi = (await exec("test -d .github/workflows && echo yes || echo no", cloneDir)) === "yes";

    let qualityScore = 0;
    if (readme.length >= 800) qualityScore += 20;
    else if (readme.length >= 400) qualityScore += 10;
    if (testFiles.length > 0) qualityScore += 20;
    if (hasLicense) qualityScore += 15;
    if (hasCi) qualityScore += 15;
    if (pkg) qualityScore += 10;
    if (readme.includes("install") || readme.includes("Install")) qualityScore += 10;
    if (readme.includes("usage") || readme.includes("Usage")) qualityScore += 10;

    return {
      name: repoName,
      fullName: `${GITHUB_ORG}/${repoName}`,
      description: (pkg as any)?.description ?? "",
      stars: 0,
      lastPush: new Date().toISOString(),
      hasReadme: readme.length > 0,
      readmeLength: readme.length,
      hasTests: testFiles.length > 0,
      hasLicense,
      hasCi,
      openIssues: 0,
      version: (pkg as any)?.version ?? "0.0.0",
      qualityScore,
      lastAuditDate: new Date().toISOString(),
      upgradeOpportunities: [],
    };
  } catch (err) {
    console.error(`[scout] Failed to audit ${repoName}:`, (err as Error).message);
    return null;
  }
}

async function readSourceSample(repoName: string): Promise<string> {
  try {
    const cloneDir = await cloneRepo(repoName);
    const sourceFiles = await listSourceFiles(cloneDir);
    const contents: string[] = [];
    for (const f of sourceFiles.slice(0, 3)) {
      const text = await exec(`cat "${f}" 2>/dev/null | head -100`, cloneDir);
      if (text) contents.push(`--- ${f} ---\n${text}`);
    }
    return contents.join("\n\n");
  } catch {
    return "";
  }
}

async function identifyUpgrades(audit: RepoAudit): Promise<string[]> {
  const opportunities: string[] = [];
  if (!audit.hasTests) opportunities.push("add-tests");
  if (audit.readmeLength < 800) opportunities.push("improve-readme");
  if (!audit.hasLicense) opportunities.push("add-license");
  // NOTE: add-ci disabled — PAT lacks `workflow` scope, can't push .github/workflows/
  if (audit.qualityScore < 60) opportunities.push("quality-sweep");

  // Phase 3.1: AI-powered feature mining for high-quality repos
  if (audit.qualityScore >= 60 && audit.hasTests && audit.hasReadme) {
    try {
      const sourceCode = await readSourceSample(audit.name);
      const resp = await chat(
        [
          {
            role: "system",
            content: `You identify concrete, implementable FEATURES for OSS TypeScript/Bun repos.
NOT structural improvements (tests, docs, CI) — real functionality.
Each feature must be <100 lines to implement.
Return a JSON array of 2-3 short feature descriptions.
Example: ["add CSV export function","add input validation with error messages","add batch processing mode"]`,
          },
          {
            role: "user",
            content: `Repo: ${audit.name}
Description: ${audit.description}
Version: ${audit.version}
Quality: ${audit.qualityScore}/100

Source code sample:
${sourceCode.slice(0, 2000)}

Suggest 2-3 concrete features that would make this library more useful. Return JSON array.`,
          },
        ],
        "micro",
        "scout",
        `feature-mining-${audit.name}`,
        512,
      );
      const match = resp.content.match(/\[[\s\S]*\]/);
      if (match) {
        const ideas = JSON.parse(match[0]) as string[];
        // Tag these as features, not generic upgrades
        for (const idea of ideas.slice(0, 3)) {
          opportunities.push(`feature: ${idea}`);
        }
      }
    } catch {
      // Fall back to generic upgrade ideas
      opportunities.push("version-bump");
    }
  } else if (opportunities.length === 0) {
    try {
      const resp = await chat(
        [
          { role: "system", content: "You identify concrete upgrade opportunities for OSS TypeScript/Bun repos. Return a JSON array of 1-3 short upgrade descriptions. Example: [\"add input validation\",\"improve error messages\"]" },
          { role: "user", content: `Repo: ${audit.name}\nDescription: ${audit.description}\nVersion: ${audit.version}\nQuality: ${audit.qualityScore}/100\nSuggest 1-3 upgrades.` },
        ],
        "micro",
        "scout",
        `upgrade-ideas-${audit.name}`,
        512,
      );
      const match = resp.content.match(/\[[\s\S]*\]/);
      if (match) {
        const ideas = JSON.parse(match[0]) as string[];
        opportunities.push(...ideas.slice(0, 3));
      }
    } catch {
      opportunities.push("version-bump");
    }
  }

  return opportunities;
}

function classifyWorkType(upgrade: string): "feature" | "test" | "docs" | "upgrade" {
  if (upgrade.startsWith("feature:")) return "feature";
  if (upgrade.includes("test")) return "test";
  if (upgrade.includes("readme") || upgrade.includes("doc")) return "docs";
  return "upgrade";
}

export async function runScout(): Promise<{ reposScanned: number; workItemsQueued: number }> {
  console.log("[scout] Starting repo scan...");
  const repos = await listRepos();
  if (repos.length === 0) {
    console.log("[scout] No repos found");
    return { reposScanned: 0, workItemsQueued: 0 };
  }

  const state = loadState();
  let workItemsQueued = 0;

  // Scan ALL repos, but skip recently-audited ones (within 3 VDays ~3 hours)
  const AUDIT_COOLDOWN_MS = 3 * (24 * 60 * 60 * 1000 / 25);
  const now = Date.now();
  const reposToAudit = repos.filter(r => {
    const existing = state.repoAudits.find(a => a.name === r.name);
    if (!existing) return true;
    return now - new Date(existing.lastAuditDate).getTime() > AUDIT_COOLDOWN_MS;
  }).slice(0, 15);

  for (const repo of reposToAudit) {
    const audit = await auditRepo(repo.name);
    if (!audit) continue;

    audit.stars = repo.stars;
    audit.openIssues = repo.openIssues;
    audit.description = repo.description || audit.description;

    const upgrades = await identifyUpgrades(audit);
    audit.upgradeOpportunities = upgrades;

    const existingIdx = state.repoAudits.findIndex(a => a.name === audit.name);
    if (existingIdx >= 0) {
      state.repoAudits[existingIdx] = audit;
    } else {
      state.repoAudits.push(audit);
    }

    for (const upgrade of upgrades) {
      const workType = classifyWorkType(upgrade);
      const description = upgrade.startsWith("feature: ") ? upgrade.slice(9) : upgrade;
      // Dynamic priority: stars + quality gap + feature boost + type success rate
      let priority = audit.stars * 2 + (100 - audit.qualityScore);
      if (workType === "feature") priority += 20;
      priority += Math.round(getTypeSuccessRate(workType) * 10);

      addWorkItem({
        repo: repo.name,
        type: workType,
        priority,
        description,
        assignedTo: "builder",
      });
      workItemsQueued++;
    }
  }

  // Reload fresh state to preserve work items added by addWorkItem() above
  const freshState = loadState();
  freshState.repoAudits = state.repoAudits;
  freshState.lastScoutRun = new Date().toISOString();
  saveState(freshState);

  award("scout", "quality-improvement", `Scanned ${reposToAudit.length} repos, queued ${workItemsQueued} items`);
  console.log(`[scout] Scanned ${reposToAudit.length} repos, queued ${workItemsQueued} work items`);
  return { reposScanned: reposToAudit.length, workItemsQueued };
}
