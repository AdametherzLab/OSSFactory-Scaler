// OSSFactory-Scaler — Meta-improvement analysis (Phase 3.5)

import { existsSync, readFileSync, renameSync } from "fs";
import { join } from "path";
import type { ImprovementSnapshot } from "./types";
import { DATA_DIR } from "./config";
import { getStats, getRecentBuilds } from "./feedback-store";
import { sendAlert } from "./telegram";

const SNAPSHOTS_FILE = join(DATA_DIR, "improvement-snapshots.json");
const BUILDS_BETWEEN_CHECKS = 10;

let buildsSinceLastCheck = 0;

function loadSnapshots(): ImprovementSnapshot[] {
  if (!existsSync(SNAPSHOTS_FILE)) return [];
  try {
    return JSON.parse(readFileSync(SNAPSHOTS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveSnapshots(snapshots: ImprovementSnapshot[]): void {
  const tmp = SNAPSHOTS_FILE + ".tmp";
  Bun.write(tmp, JSON.stringify(snapshots, null, 2));
  renameSync(tmp, SNAPSHOTS_FILE);
}

function determineVelocity(snapshots: ImprovementSnapshot[]): "improving" | "stable" | "declining" {
  if (snapshots.length < 2) return "stable";
  const recent = snapshots.slice(-3);
  const rates = recent.map(s => s.shipRate);
  const trend = rates[rates.length - 1] - rates[0];
  if (trend > 0.05) return "improving";
  if (trend < -0.05) return "declining";
  return "stable";
}

export function tickBuild(): void {
  buildsSinceLastCheck++;
}

export async function maybeRunImprovement(): Promise<void> {
  if (buildsSinceLastCheck < BUILDS_BETWEEN_CHECKS) return;
  buildsSinceLastCheck = 0;

  const stats = getStats();
  if (stats.total < 5) return;

  const snapshots = loadSnapshots();
  const velocity = determineVelocity(snapshots);

  const snapshot: ImprovementSnapshot = {
    timestamp: new Date().toISOString(),
    shipRate: stats.shipRate,
    avgCostPerShip: stats.avgCost,
    featureRatio: stats.featureRatio,
    avgRepairPasses: stats.avgRepairs,
    buildsAnalyzed: stats.total,
    velocity,
  };

  snapshots.push(snapshot);
  if (snapshots.length > 50) snapshots.splice(0, snapshots.length - 50);
  saveSnapshots(snapshots);

  // Analyze trends
  const recent = getRecentBuilds(20);
  const failingGates = recent
    .filter(b => b.result === "failed")
    .map(b => b.gateDetails)
    .filter(Boolean);

  const gateFreq: Record<string, number> = {};
  for (const detail of failingGates) {
    const gate = detail.split(":")[0] || "unknown";
    gateFreq[gate] = (gateFreq[gate] ?? 0) + 1;
  }

  const topFailGate = Object.entries(gateFreq).sort((a, b) => b[1] - a[1])[0];

  const summary = [
    `Improvement Report (every ${BUILDS_BETWEEN_CHECKS} builds)`,
    `Ship rate: ${(stats.shipRate * 100).toFixed(0)}% | Feature ratio: ${(stats.featureRatio * 100).toFixed(0)}%`,
    `Avg cost/ship: $${stats.avgCost.toFixed(3)} | Avg repairs: ${stats.avgRepairs.toFixed(1)}`,
    `Velocity: ${velocity}`,
    topFailGate ? `Top failing gate: ${topFailGate[0]} (${topFailGate[1]} failures)` : "No recent failures",
  ].join("\n");

  console.log(`[improve] ${summary}`);
  await sendAlert(summary);
}

export function getLatestSnapshot(): ImprovementSnapshot | null {
  const snapshots = loadSnapshots();
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}
