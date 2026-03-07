// OSSFactory-Scaler — Critic agent: quality review + 333-char observation
// Phase 2.4: structured feedback pipeline — critic hints for builder

import { existsSync, readFileSync, renameSync } from "fs";
import { join } from "path";
import { chat } from "../model-router";
import { checkShipReady } from "../quality-gates";
import { award } from "../slicing-pie";
import { loadState } from "../state";
import { getRecentFailures } from "../feedback-store";
import { DATA_DIR } from "../config";
import type { CriticHint } from "../types";

const HINTS_FILE = join(DATA_DIR, "critic-hints.json");

function loadHints(): CriticHint[] {
  if (!existsSync(HINTS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(HINTS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveHints(hints: CriticHint[]): void {
  const tmp = HINTS_FILE + ".tmp";
  Bun.write(tmp, JSON.stringify(hints, null, 2));
  renameSync(tmp, HINTS_FILE);
}

export function getCriticHints(): CriticHint[] {
  return loadHints().filter(h => h.score >= 0).slice(0, 5);
}

async function generateHints(): Promise<void> {
  const failures = getRecentFailures(5);
  if (failures.length < 2) return;

  const failureSummary = failures
    .map(f => `${f.repo} (${f.workType}): ${f.gateDetails}`)
    .join("\n");

  try {
    const resp = await chat(
      [
        {
          role: "system",
          content: `You analyze build failures and extract reusable rules. Return a JSON array of objects with "rule" (actionable advice) and "category" (one of: code-quality, test-writing, readme, security, general). Max 3 rules. No prose.`,
        },
        {
          role: "user",
          content: `Recent build failures:\n${failureSummary}\n\nExtract patterns. Return JSON array.`,
        },
      ],
      "micro",
      "critic",
      "generate-hints",
      512,
    );

    const match = resp.content.match(/\[[\s\S]*\]/);
    if (!match) return;
    const parsed = JSON.parse(match[0]) as { rule: string; category: string }[];

    const hints = loadHints();
    for (const p of parsed.slice(0, 3)) {
      // Don't add duplicate hints
      if (hints.some(h => h.rule === p.rule)) continue;
      hints.push({
        rule: p.rule,
        category: p.category,
        examples: [],
        score: 0,
        createdAt: new Date().toISOString(),
      });
    }
    // Keep only top 10 hints by score
    hints.sort((a, b) => b.score - a.score);
    saveHints(hints.slice(0, 10));
  } catch (err) {
    console.error("[critic] Hint generation failed:", (err as Error).message);
  }
}

export async function runCritic(): Promise<{ reviewed: boolean; observation: string }> {
  const state = loadState();
  const recentWork = state.completedWork.slice(-3);

  // Generate structured hints from failures (Phase 2.4)
  await generateHints();

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
