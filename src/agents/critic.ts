// OSSFactory-Scaler — Critic agent: quality review + 333-char observation

import { chat } from "../model-router";
import { checkShipReady } from "../quality-gates";
import { award } from "../slicing-pie";
import { loadState } from "../state";

export async function runCritic(): Promise<{ reviewed: boolean; observation: string }> {
  const state = loadState();
  const recentWork = state.completedWork.slice(-3);

  if (recentWork.length === 0) {
    return { reviewed: false, observation: "No recent work to review." };
  }

  const workSummary = recentWork
    .map(w => `${w.repo}: ${w.type} — ${w.status} — ${w.result ?? "no result"}`)
    .join("\n");

  const audits = state.repoAudits.slice(-5);
  const auditSummary = audits
    .map(a => `${a.name}: quality=${a.qualityScore}, tests=${a.hasTests}, readme=${a.readmeLength}ch`)
    .join("\n");

  try {
    const resp = await chat(
      [
        {
          role: "system",
          content: `You are a quality critic for an OSS factory. Review recent work and audits.
Write a single observation in EXACTLY 333 characters or fewer. Be specific, constructive, and actionable.
Focus on: patterns in failures, quality trends, what to prioritize next.
Do NOT use markdown. Plain text only.`,
        },
        {
          role: "user",
          content: `Recent completed work:\n${workSummary}\n\nRepo audits:\n${auditSummary}\n\nWrite your observation (max 333 chars):`,
        },
      ],
      "micro",
      "critic",
      "daily-observation",
      256,
    );

    const observation = resp.content.slice(0, 333).trim();
    award("critic", "successful-review", observation.slice(0, 80));
    console.log(`[critic] Observation: ${observation}`);

    return { reviewed: true, observation };
  } catch (err) {
    console.error("[critic] Error:", (err as Error).message);
    return { reviewed: false, observation: `Error: ${(err as Error).message}` };
  }
}

export async function reviewBuild(cloneDir: string, repoName: string): Promise<{
  approved: boolean;
  score: number;
  feedback: string;
}> {
  const shipCheck = await checkShipReady(cloneDir);
  const gateSummary = shipCheck.gates
    .map(g => `${g.gate}: ${g.passed ? "PASS" : "FAIL"} (${g.score}) — ${g.details}`)
    .join("\n");

  if (shipCheck.compositeScore >= 70) {
    award("critic", "successful-review", `Approved ${repoName} at ${shipCheck.compositeScore}/100`);
    return {
      approved: true,
      score: shipCheck.compositeScore,
      feedback: `Approved. ${gateSummary}`,
    };
  }

  return {
    approved: false,
    score: shipCheck.compositeScore,
    feedback: `Rejected (${shipCheck.compositeScore}/100). ${gateSummary}`,
  };
}
