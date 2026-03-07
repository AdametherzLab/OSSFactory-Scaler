// OSSFactory-Scaler — Main VDay loop, wires all 5 agents
// Phase 1.2: 2 builds per VDay
// Phase 1.3: Decoupled demo (fire and forget, only when last build shipped)
// Phase 2.1: Parallel build slots (MAX_CONCURRENT=3)
// Phase 3.5: Improvement cycle every 10 builds

import { getCurrentVDay, msUntilNextVDay, getVDayLabel, isMeetingVDay } from "./vday";
import { isBudgetExhausted, getBudgetSummary } from "./token-tracker";
import { loadState, saveState } from "./state";
import { sendVDayReport, sendMeetingReport, sendShipNotification, sendAlert } from "./telegram";
import { runScout } from "./agents/scout";
import { runBuilder } from "./agents/builder";
import { runCritic } from "./agents/critic";
import { runDemo } from "./agents/demo";
import { runMaintainer } from "./agents/maintainer";
import { maybeRunImprovement } from "./improve-cycle";
import type { VDayReport, BuildResult } from "./types";

const MAX_CONCURRENT = 3;
const MAX_BUILDS_PER_VDAY = 5;
const MIN_BUDGET_FOR_BUILD = 0.10;

async function runParallelBuilds(inFlightNames: Set<string>): Promise<BuildResult[]> {
  const results: BuildResult[] = [];
  let buildsAttempted = 0;

  while (buildsAttempted < MAX_BUILDS_PER_VDAY) {
    if (isBudgetExhausted()) break;

    const budget = getBudgetSummary();
    if (budget.remaining < MIN_BUDGET_FOR_BUILD) break;

    // Calculate how many parallel slots to fill
    const slotsAvailable = Math.min(
      MAX_CONCURRENT,
      MAX_BUILDS_PER_VDAY - buildsAttempted,
      Math.floor(budget.remaining / MIN_BUDGET_FOR_BUILD),
    );

    if (slotsAvailable <= 0) break;

    // Launch parallel builds
    const promises: Promise<BuildResult>[] = [];
    for (let i = 0; i < slotsAvailable; i++) {
      promises.push(runBuilder(inFlightNames));
    }

    const batchResults = await Promise.all(promises);

    // Track results and update inFlight set
    for (const result of batchResults) {
      results.push(result);
      if (result.attempted) {
        inFlightNames.delete(result.attempted);
      }
      buildsAttempted++;
    }

    // If all slots returned skipped, no more work available
    if (batchResults.every(r => r.result === "skipped")) break;
  }

  return results;
}

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

  // 1. Scout scans repos (once per VDay, not per build)
  const scoutResult = await runScout();

  // 2. Parallel builder pipeline
  const inFlightNames = new Set<string>();
  const builderResults = await runParallelBuilds(inFlightNames);

  const shipped = builderResults.filter(r => r.result === "shipped");
  const failed = builderResults.filter(r => r.result === "failed");
  console.log(`[main] Builds: ${shipped.length} shipped, ${failed.length} failed, ${builderResults.length} total`);

  // 3. Critic reviews
  const criticResult = await runCritic();

  // 4. Demo: fire and forget, only when something shipped this VDay
  let demoResult: { created: string | null; updated: string | null } = { created: null, updated: null };
  if (shipped.length > 0) {
    // Don't block VDay loop — run async
    runDemo().then(r => {
      if (r.created) console.log(`[main] Demo created: ${r.created}`);
    }).catch(err => console.error("[main] Demo error:", (err as Error).message));
    demoResult = { created: "pending", updated: null };
  }

  // 5. Maintainer triages issues (once per VDay)
  const maintainerResult = await runMaintainer();

  // 6. Improvement cycle check
  await maybeRunImprovement();

  // Build report
  const budgetAfter = getBudgetSummary();
  const report: VDayReport = {
    vday,
    timestamp: new Date().toISOString(),
    scout: scoutResult,
    builders: builderResults,
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

  // Send ship notifications for all shipped builds
  for (const build of shipped) {
    if (build.attempted) {
      const completedItem = state.completedWork.find(
        w => w.repo === build.attempted && w.result?.startsWith("Shipped")
      );
      const version = completedItem?.result?.match(/v[\d.]+/)?.[0] ?? "";
      await sendShipNotification(
        build.attempted,
        version,
        completedItem?.description ?? "Upgrade",
      );
    }
  }

  // Send VDay report
  await sendVDayReport(report);

  // Team meeting every 5th VDay
  if (isMeetingVDay()) {
    console.log("[main] Team meeting!");
    await sendMeetingReport(vday);
  }

  return report;
}

function makeEmptyReport(vday: string, spent: number, remaining: number): VDayReport {
  return {
    vday,
    timestamp: new Date().toISOString(),
    scout: { reposScanned: 0, workItemsQueued: 0 },
    builders: [],
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
  console.log("[main] OSSFactory-Scaler v0.3.0 starting...");
  console.log(`[main] VDay: ${getVDayLabel()}`);
  console.log(`[main] Budget: $${getBudgetSummary().limit}/day`);
  console.log(`[main] Max concurrent builds: ${MAX_CONCURRENT}`);

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
