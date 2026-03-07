// OSSFactory-Scaler — Self-improving prompt rules (Phase 3.4)

import { existsSync, readFileSync, renameSync } from "fs";
import { join } from "path";
import type { PromptRule } from "./types";
import { DATA_DIR } from "./config";

const RULES_FILE = join(DATA_DIR, "prompt-rules.json");
const MAX_RULES = 50;
const PRUNE_THRESHOLD = -3;

function loadRules(): PromptRule[] {
  if (!existsSync(RULES_FILE)) return [];
  try {
    return JSON.parse(readFileSync(RULES_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveRules(rules: PromptRule[]): void {
  const tmp = RULES_FILE + ".tmp";
  Bun.write(tmp, JSON.stringify(rules, null, 2));
  renameSync(tmp, RULES_FILE);
}

export function addRule(context: string, rule: string): void {
  const rules = loadRules();
  // Don't add duplicate rules
  if (rules.some(r => r.rule === rule)) return;

  rules.push({
    id: Math.random().toString(36).slice(2, 10),
    rule,
    context,
    score: 0,
    applied: 0,
    createdAt: new Date().toISOString(),
  });

  // Prune low-scoring rules
  const filtered = rules.filter(r => r.score > PRUNE_THRESHOLD);
  // Keep only top MAX_RULES by score
  filtered.sort((a, b) => b.score - a.score);
  saveRules(filtered.slice(0, MAX_RULES));
}

export function reinforceRule(id: string): void {
  const rules = loadRules();
  const rule = rules.find(r => r.id === id);
  if (rule) {
    rule.score++;
    rule.applied++;
    saveRules(rules);
  }
}

export function penalizeRule(id: string): void {
  const rules = loadRules();
  const rule = rules.find(r => r.id === id);
  if (rule) {
    rule.score--;
    saveRules(rules);
  }
}

export function onBuildSuccess(workType: string, description: string): void {
  addRule(workType, `When doing "${workType}" tasks like "${description}", this approach works well.`);
  // Reinforce any rules that match this context
  const rules = loadRules();
  for (const r of rules) {
    if (r.context === workType) reinforceRule(r.id);
  }
}

export function onBuildFailure(workType: string, gateDetails: string): void {
  // Extract pattern from failure
  const rule = `When doing "${workType}" tasks, avoid patterns that cause: ${gateDetails.slice(0, 100)}`;
  addRule(workType, rule);
}

export function getTopRules(count = 5): PromptRule[] {
  return loadRules()
    .filter(r => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

export function formatRulesForPrompt(): string {
  const top = getTopRules();
  if (top.length === 0) return "";
  return "\n\nLearned rules from past builds:\n" +
    top.map(r => `- ${r.rule}`).join("\n");
}
