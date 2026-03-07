// OSSFactory-Scaler — Atomic JSON persistence

import { existsSync, readFileSync, renameSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import type { ScalerState, WorkItem } from "./types";
import { DATA_DIR } from "./config";

const STATE_FILE = join(DATA_DIR, "scaler-state.json");

function defaultState(): ScalerState {
  return {
    workQueue: [],
    repoAudits: [],
    completedWork: [],
    vdayReports: [],
    lastScoutRun: null,
    currentVDay: 0,
  };
}

export function loadState(): ScalerState {
  if (!existsSync(STATE_FILE)) return defaultState();
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return defaultState();
  }
}

export function saveState(state: ScalerState): void {
  const tmp = STATE_FILE + ".tmp";
  Bun.write(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, STATE_FILE);
}

export function addWorkItem(item: Omit<WorkItem, "id" | "createdAt" | "status">): WorkItem {
  const state = loadState();
  const workItem: WorkItem = {
    ...item,
    id: randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
    status: "queued",
  };

  // Check queue AND recent completed work to avoid re-queuing failed items
  const inQueue = state.workQueue.some(
    w => w.repo === item.repo && w.type === item.type && w.status === "queued"
  );
  const recentlyDone = state.completedWork.slice(-50).some(
    w => w.repo === item.repo && w.description === item.description
  );
  if (!inQueue && !recentlyDone) {
    state.workQueue.push(workItem);
    state.workQueue.sort((a, b) => b.priority - a.priority);
    saveState(state);
  }
  return workItem;
}

export function pickNextWork(inFlightNames?: Set<string>): WorkItem | null {
  const state = loadState();

  // Smart prioritization (Phase 2.2): score work items dynamically
  const scored = state.workQueue
    .filter(w => w.status === "queued")
    .filter(w => !inFlightNames || !inFlightNames.has(w.repo))
    .map(w => {
      let score = w.priority;
      // Boost feature items
      if (w.type === "feature") score += 20;
      // Deprioritize repos with recent failures
      const recentFailures = state.completedWork
        .slice(-50)
        .filter(c => c.repo === w.repo && c.status === "failed").length;
      score -= recentFailures * 15;
      return { item: w, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  const item = scored[0].item;
  item.status = "in-progress";
  saveState(state);
  return item;
}

export function completeWork(id: string, result: string): void {
  const state = loadState();
  const idx = state.workQueue.findIndex(w => w.id === id);
  if (idx === -1) return;
  const item = state.workQueue.splice(idx, 1)[0];
  item.status = "completed";
  item.result = result;
  state.completedWork.push(item);
  if (state.completedWork.length > 200) {
    state.completedWork = state.completedWork.slice(-200);
  }
  saveState(state);
}

export function failWork(id: string, reason: string): void {
  const state = loadState();
  const idx = state.workQueue.findIndex(w => w.id === id);
  if (idx === -1) return;
  const item = state.workQueue.splice(idx, 1)[0];
  item.status = "failed";
  item.result = reason;
  state.completedWork.push(item);
  saveState(state);
}

export function pruneOldAudits(maxAgeDays = 7): void {
  const state = loadState();
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  state.repoAudits = state.repoAudits.filter(
    a => new Date(a.lastAuditDate).getTime() > cutoff
  );
  saveState(state);
}
