// OSSFactory-Scaler — Maintainer agent: issue triage, auto-respond, health scoring

import type { HealthScore } from "../types";
import { chat } from "../model-router";
import { listRepos, getRepoIssues, labelIssue, commentOnIssue } from "../github-client";
import { loadState } from "../state";
import { award } from "../slicing-pie";
import { GITHUB_ORG } from "../config";

async function triageIssue(
  repo: string,
  issue: { number: number; title: string; labels: any[]; state: string },
): Promise<void> {
  const existingLabels = (issue.labels ?? []).map((l: any) => l.name ?? l);
  if (existingLabels.length > 0) return; // already labeled

  try {
    const resp = await chat(
      [
        {
          role: "system",
          content: `You label GitHub issues. Return a JSON array of 1-2 labels from: ["bug","enhancement","documentation","question","good first issue","help wanted","wontfix"]. No other text.`,
        },
        {
          role: "user",
          content: `Issue #${issue.number}: ${issue.title}`,
        },
      ],
      "micro",
      "maintainer",
      `triage-${repo}-${issue.number}`,
      128,
    );

    const match = resp.content.match(/\[[\s\S]*\]/);
    if (match) {
      const labels = JSON.parse(match[0]) as string[];
      const valid = labels.filter(l =>
        ["bug", "enhancement", "documentation", "question", "good first issue", "help wanted", "wontfix"].includes(l)
      );
      if (valid.length > 0) {
        await labelIssue(repo, issue.number, valid);
        award("maintainer", "fix-issue", `Labeled ${repo}#${issue.number}: ${valid.join(",")}`);
      }
    }
  } catch (err) {
    console.error(`[maintainer] Triage failed for ${repo}#${issue.number}:`, (err as Error).message);
  }
}

function computeHealthScore(repoName: string): HealthScore {
  const state = loadState();
  const audit = state.repoAudits.find(a => a.name === repoName);

  if (!audit) {
    return {
      repo: repoName,
      score: 50,
      factors: {
        hasReadme: false, hasTests: false, hasLicense: false,
        hasCi: false, recentActivity: false, lowIssueCount: true,
      },
      lastChecked: new Date().toISOString(),
    };
  }

  const daysSincePush = (Date.now() - new Date(audit.lastPush).getTime()) / 86_400_000;
  const factors = {
    hasReadme: audit.hasReadme,
    hasTests: audit.hasTests,
    hasLicense: audit.hasLicense,
    hasCi: audit.hasCi,
    recentActivity: daysSincePush < 30,
    lowIssueCount: audit.openIssues <= 3,
  };

  let score = 0;
  if (factors.hasReadme) score += 20;
  if (factors.hasTests) score += 20;
  if (factors.hasLicense) score += 15;
  if (factors.hasCi) score += 15;
  if (factors.recentActivity) score += 15;
  if (factors.lowIssueCount) score += 15;

  return { repo: repoName, score, factors, lastChecked: new Date().toISOString() };
}

export async function runMaintainer(): Promise<{ issuesTriaged: number; healthChecks: number }> {
  console.log("[maintainer] Starting issue triage and health checks...");
  const repos = await listRepos();
  let issuesTriaged = 0;
  let healthChecks = 0;

  for (const repo of repos.slice(0, 10)) {
    const issues = await getRepoIssues(repo.name);
    const openIssues = issues.filter((i: any) => i.state === "OPEN");

    for (const issue of openIssues.slice(0, 3)) {
      await triageIssue(repo.name, issue);
      issuesTriaged++;
    }

    computeHealthScore(repo.name);
    healthChecks++;
  }

  if (issuesTriaged > 0) {
    award("maintainer", "fix-issue", `Triaged ${issuesTriaged} issues across ${healthChecks} repos`);
  }

  console.log(`[maintainer] Triaged ${issuesTriaged} issues, ${healthChecks} health checks`);
  return { issuesTriaged, healthChecks };
}
