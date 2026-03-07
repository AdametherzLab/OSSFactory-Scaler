// OSSFactory-Scaler — Build metrics tracking (Phase 1.5)

import { existsSync, readFileSync, renameSync } from "fs";
import { join } from "path";
import type { BuildFeedback, WorkItemType, ModelTier } from "./types";
import { DATA_DIR } from "./config";

const FEEDBACK_FILE = join(DATA_DIR, "build-feedback.json");
const MAX_ENTRIES = 200;

function loadFeedback(): BuildFeedback[] {
  if (!existsSync(FEEDBACK_FILE)) return [];
  try {
    return JSON.parse(readFileSync(FEEDBACK_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveFeedback(entries: BuildFeedback[]): void {
  const tmp = FEEDBACK_FILE + ".tmp";
  Bun.write(tmp, JSON.stringify(entries, null, 2));
  renameSync(tmp, FEEDBACK_FILE);
}

export function recordBuild(feedback: BuildFeedback): void {
  const entries = loadFeedback();
  entries.push(feedback);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
  saveFeedback(entries);
}

export function getRecentBuilds(count = 50): BuildFeedback[] {
  return loadFeedback().slice(-count);
}

export function getRecentFailures(count = 10): BuildFeedback[] {
  return loadFeedback().filter(b => b.result === "failed").slice(-count);
}

export function getRecentSuccesses(count = 10): BuildFeedback[] {
  return loadFeedback().filter(b => b.result === "shipped").slice(-count);
}

export function getRepoFailCount(repo: string, windowMs = 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - windowMs;
  return loadFeedback().filter(
    b => b.repo === repo && b.result === "failed" && new Date(b.timestamp).getTime() > cutoff
  ).length;
}

export function getTypeSuccessRate(type: WorkItemType): number {
  const all = loadFeedback().filter(b => b.workType === type);
  if (all.length < 3) return 0.5;
  const shipped = all.filter(b => b.result === "shipped").length;
  return shipped / all.length;
}

export function getStats(): {
  total: number;
  shipped: number;
  failed: number;
  shipRate: number;
  avgCost: number;
  avgRepairs: number;
  featureRatio: number;
} {
  const all = loadFeedback();
  const shipped = all.filter(b => b.result === "shipped");
  const failed = all.filter(b => b.result === "failed");
  const features = all.filter(b => b.workType === "feature");
  return {
    total: all.length,
    shipped: shipped.length,
    failed: failed.length,
    shipRate: all.length > 0 ? shipped.length / all.length : 0,
    avgCost: shipped.length > 0 ? shipped.reduce((s, b) => s + b.costUsd, 0) / shipped.length : 0,
    avgRepairs: all.length > 0 ? all.reduce((s, b) => s + b.repairPasses, 0) / all.length : 0,
    featureRatio: all.length > 0 ? features.length / all.length : 0,
  };
}
