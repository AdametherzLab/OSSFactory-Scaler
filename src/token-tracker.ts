// OSSFactory-Scaler — Budget tracking with alerts

import { existsSync, readFileSync, renameSync } from "fs";
import { join } from "path";
import type { TokenEntry, DailyBudget } from "./types";
import { DATA_DIR, DAILY_BUDGET_USD } from "./config";

const TOKEN_FILE = join(DATA_DIR, "token-usage.json");

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadBudget(): DailyBudget {
  if (!existsSync(TOKEN_FILE)) {
    return { date: today(), entries: [], totalCost: 0, limitUsd: DAILY_BUDGET_USD };
  }
  try {
    const raw = readFileSync(TOKEN_FILE, "utf-8");
    const data: DailyBudget = JSON.parse(raw);
    if (data.date !== today()) {
      return { date: today(), entries: [], totalCost: 0, limitUsd: DAILY_BUDGET_USD };
    }
    return data;
  } catch {
    return { date: today(), entries: [], totalCost: 0, limitUsd: DAILY_BUDGET_USD };
  }
}

function saveBudget(budget: DailyBudget): void {
  const tmp = TOKEN_FILE + ".tmp";
  Bun.write(tmp, JSON.stringify(budget, null, 2));
  renameSync(tmp, TOKEN_FILE);
}

export function trackUsage(entry: TokenEntry): void {
  const budget = loadBudget();
  budget.entries.push(entry);
  budget.totalCost = budget.entries.reduce((sum, e) => sum + e.costUsd, 0);
  saveBudget(budget);

  const pct = (budget.totalCost / budget.limitUsd) * 100;
  if (pct >= 100) {
    console.warn(`[budget] EXHAUSTED: $${budget.totalCost.toFixed(4)} / $${budget.limitUsd}`);
  } else if (pct >= 80) {
    console.warn(`[budget] WARNING 80%: $${budget.totalCost.toFixed(4)} / $${budget.limitUsd}`);
  } else if (pct >= 50) {
    console.log(`[budget] 50% mark: $${budget.totalCost.toFixed(4)} / $${budget.limitUsd}`);
  }
}

export function getRemainingBudget(): number {
  const budget = loadBudget();
  return Math.max(0, budget.limitUsd - budget.totalCost);
}

export function getTodaySpend(): number {
  return loadBudget().totalCost;
}

export function isBudgetExhausted(): boolean {
  return getRemainingBudget() <= 0;
}

export function getBudgetSummary(): {
  date: string;
  spent: number;
  remaining: number;
  limit: number;
  pct: number;
  callCount: number;
} {
  const budget = loadBudget();
  const remaining = Math.max(0, budget.limitUsd - budget.totalCost);
  return {
    date: budget.date,
    spent: budget.totalCost,
    remaining,
    limit: budget.limitUsd,
    pct: (budget.totalCost / budget.limitUsd) * 100,
    callCount: budget.entries.length,
  };
}

export function getSpendByAgent(): Record<string, number> {
  const budget = loadBudget();
  const byAgent: Record<string, number> = {};
  for (const e of budget.entries) {
    byAgent[e.agent] = (byAgent[e.agent] ?? 0) + e.costUsd;
  }
  return byAgent;
}

export function getSpendByTier(): Record<string, number> {
  const budget = loadBudget();
  const byTier: Record<string, number> = {};
  for (const e of budget.entries) {
    byTier[e.tier] = (byTier[e.tier] ?? 0) + e.costUsd;
  }
  return byTier;
}

// Per-build budget tracking (Phase 2.5)
let buildSpendStart = 0;
let buildSpendEntries = 0;

export function resetBuildSpend(): void {
  const budget = loadBudget();
  buildSpendStart = budget.totalCost;
  buildSpendEntries = budget.entries.length;
}

export function getBuildSpend(): number {
  const budget = loadBudget();
  return Math.max(0, budget.totalCost - buildSpendStart);
}
