// OSSFactory-Scaler — Main VDay loop, wires all 5 agents

import { getCurrentVDay, msUntilNextVDay, getVDayLabel, isMeetingVDay } from "./vday";
import { isBudgetExhausted, getBudgetSummary, getRemainingBudget } from "./token-tracker";
import { loadState, saveState } from "./state";
import { formatLeaderboard } from "./slicing-pie";
import { sendVDayReport, sendMeetingReport, sendAlert } from "./telegram";
import { runScout } from "./agents/scout";
import { runBuilder } from "./agents/builder";
import { runCritic } from "./agents/critic";
import { runDemo } from "./agents/demo";
import { runMaintainer } from "./agents/maintainer";
import type { VDayReport } from "./types";

async function runVDay(): Promise<VDayReport> {
  const vday = getVDayLabel();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[main] Starting ${vday}`);
  console.log(`${"=".repeat(60)}`);

  const budget = getBudgetSummary();
  console.log(`[main] Budget: $${budget.spent.toFixed(4)} / $${budget.limit} (${budget.pct.toFixed(1)}%)`);

  if (isBudgetExhausted()) {
    console.log("[main] Budget exhausted, sleeping until next day...");
    await sendAlert("Daily budget exhausted. Sleeping.");
    return makeEmptyReport(vday, budget.spent, 0);
  }

  // 1. Scout scans repos
  const scoutResult = await runScout();

  // 2. Builder picks and upgrades
  const builderResult = await runBuilder();

  // 3. Critic reviews
  const criticResult = await runCritic();

  // 4. Demo creates pages
  const demoResult = await runDemo();

  // 5. Maintainer triages issues
  const maintainerResult = await runMaintainer();

  // Build report
  const budgetAfter = getBudgetSummary();
  const report: VDayReport = {
    vday,
    timestamp: new Date().toISOString(),
    scout: scoutResult,
    builder: builderResult,
    critic: criticResult,
    demo: demoResult,
    maintainer: maintainerResult,
    budgetUsed: budgetAfter.spent - budget.spent,
    budgetRemaining: budgetAfter.remaining,
  };

  // Save report
  const state = loadState();
  state.vdayReports.push(report);
  if (state.vdayReports.length > 100) {
    state.vdayReports = state.vdayReports.slice(-100);
  }
  state.currentVDay = getCurrentVDay().index;
  saveState(state);

  // Send VDay report
  const summary = [
    `Scout: ${scoutResult.reposScanned} scanned, ${scoutResult.workItemsQueued} queued`,
    `Builder: ${builderResult.attempted ?? "none"} — ${builderResult.result}`,
    `Critic: ${criticResult.observation.slice(0, 100)}`,
    `Demo: ${demoResult.created ? `created ${demoResult.created}` : "none"}`,
    `Maintainer: ${maintainerResult.issuesTriaged} triaged`,
  ].join("\n");
  await sendVDayReport(vday, summary, budgetAfter.spent, budgetAfter.remaining);

  // Team meeting every 5th VDay
  if (isMeetingVDay()) {
    console.log("[main] Team meeting!");
    const leaderboard = formatLeaderboard();
    const highlights = [
      `VDay: ${vday}`,
      `Budget: $${budgetAfter.spent.toFixed(2)} / $${budgetAfter.limit}`,
      `Queue depth: ${state.workQueue.filter(w => w.status === "queued").length}`,
      `Total completed: ${state.completedWork.length}`,
    ].join("\n");
    await sendMeetingReport(vday, leaderboard, highlights);
  }

  return report;
}

function makeEmptyReport(vday: string, spent: number, remaining: number): VDayReport {
  return {
    vday,
    timestamp: new Date().toISOString(),
    scout: { reposScanned: 0, workItemsQueued: 0 },
    builder: { attempted: null, result: "skipped" },
    critic: { reviewed: false, observation: "Budget exhausted" },
    demo: { created: null, updated: null },
    maintainer: { issuesTriaged: 0, healthChecks: 0 },
    budgetUsed: 0,
    budgetRemaining: remaining,
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log("[main] OSSFactory-Scaler starting...");
  console.log(`[main] VDay: ${getVDayLabel()}`);
  console.log(`[main] Budget: $${getBudgetSummary().limit}/day`);

  // Run continuously
  while (true) {
    try {
      await runVDay();
    } catch (err) {
      console.error("[main] VDay error:", (err as Error).message);
      await sendAlert(`VDay error: ${(err as Error).message}`);
    }

    const waitMs = msUntilNextVDay();
    console.log(`[main] Sleeping ${Math.round(waitMs / 1000)}s until next VDay...`);
    await sleep(waitMs);
  }
}

main().catch(err => {
  console.error("[main] Fatal:", err);
  process.exit(1);
});
