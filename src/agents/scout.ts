// OSSFactory-Scaler — Scout agent: scan repos, audit quality, prioritize work queue

import type { RepoAudit } from "../types";
import { chat } from "../model-router";
import { listRepos, getReadme, cloneRepo, getPackageJson, listTestFiles } from "../github-client";
import { loadState, saveState, addWorkItem } from "../state";
import { award } from "../slicing-pie";
import { GITHUB_ORG } from "../config";

async function auditRepo(repoName: string): Promise<RepoAudit | null> {
  try {
    const cloneDir = await cloneRepo(repoName);
    const readme = await getReadme(repoName, cloneDir);
    const pkg = await getPackageJson(cloneDir);
    const testFiles = await listTestFiles(cloneDir);

    const exec = async (cmd: string) => {
      const proc = Bun.spawn(["bash", "-c", cmd], { cwd: cloneDir, stdout: "pipe", stderr: "pipe" });
      return (await new Response(proc.stdout).text()).trim();
    };

    const hasLicense = (await exec("test -f LICENSE && echo yes || echo no")) === "yes";
    const hasCi = (await exec("test -d .github/workflows && echo yes || echo no")) === "yes";

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

async function identifyUpgrades(audit: RepoAudit): Promise<string[]> {
  const opportunities: string[] = [];
  if (!audit.hasTests) opportunities.push("add-tests");
  if (audit.readmeLength < 800) opportunities.push("improve-readme");
  if (!audit.hasLicense) opportunities.push("add-license");
  if (!audit.hasCi) opportunities.push("add-ci");
  if (audit.qualityScore < 60) opportunities.push("quality-sweep");

  if (opportunities.length === 0 && audit.hasTests && audit.hasReadme) {
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

export async function runScout(): Promise<{ reposScanned: number; workItemsQueued: number }> {
  console.log("[scout] Starting repo scan...");
  const repos = await listRepos();
  if (repos.length === 0) {
    console.log("[scout] No repos found");
    return { reposScanned: 0, workItemsQueued: 0 };
  }

  const state = loadState();
  let workItemsQueued = 0;

  const reposToAudit = repos.slice(0, 10);

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
      const priority = audit.stars * 2 + (100 - audit.qualityScore);
      addWorkItem({
        repo: repo.name,
        type: upgrade.includes("test") ? "test" : upgrade.includes("readme") || upgrade.includes("doc") ? "docs" : "upgrade",
        priority,
        description: upgrade,
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
