// OSSFactory-Scaler — Slicing Pie reward tracking

import { existsSync, readFileSync, renameSync } from "fs";
import { join } from "path";
import type { AgentRole, SlicingPieState, SlicingPieEntry } from "./types";
import { DATA_DIR } from "./config";

const PIE_FILE = join(DATA_DIR, "slicing-pie.json");

const POINT_VALUES: Record<string, number> = {
  "ship-release": 10,
  "create-demo": 8,
  "fix-issue": 5,
  "update-demo": 5,
  "quality-improvement": 3,
  "successful-review": 2,
  "failed-ship": -3,
  "regression": -5,
  "budget-overrun": -2,
};

function loadPie(): SlicingPieState {
  if (!existsSync(PIE_FILE)) {
    return {
      entries: [],
      totals: { scout: 0, builder: 0, demo: 0, maintainer: 0, critic: 0 },
    };
  }
  try {
    return JSON.parse(readFileSync(PIE_FILE, "utf-8"));
  } catch {
    return {
      entries: [],
      totals: { scout: 0, builder: 0, demo: 0, maintainer: 0, critic: 0 },
    };
  }
}

function savePie(state: SlicingPieState): void {
  const tmp = PIE_FILE + ".tmp";
  Bun.write(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, PIE_FILE);
}

export function award(agent: AgentRole, action: string, reason: string): number {
  const points = POINT_VALUES[action] ?? 0;
  if (points === 0) return 0;

  const state = loadPie();
  const entry: SlicingPieEntry = {
    timestamp: new Date().toISOString(),
    agent,
    action,
    points,
    reason,
  };
  state.entries.push(entry);
  state.totals[agent] = (state.totals[agent] ?? 0) + points;

  if (state.entries.length > 500) {
    state.entries = state.entries.slice(-500);
  }
  savePie(state);
  return points;
}

export function getLeaderboard(): { agent: AgentRole; points: number }[] {
  const state = loadPie();
  return (Object.entries(state.totals) as [AgentRole, number][])
    .map(([agent, points]) => ({ agent, points }))
    .sort((a, b) => b.points - a.points);
}

export function formatLeaderboard(): string {
  const board = getLeaderboard();
  const medals = ["1st", "2nd", "3rd", "4th", "5th"];
  return board
    .map((entry, i) => `${medals[i] ?? `${i + 1}th`}: ${entry.agent} — ${entry.points} pts`)
    .join("\n");
}

export function getAgentPoints(agent: AgentRole): number {
  return loadPie().totals[agent] ?? 0;
}

export function getRecentEntries(count = 10): SlicingPieEntry[] {
  const state = loadPie();
  return state.entries.slice(-count);
}
