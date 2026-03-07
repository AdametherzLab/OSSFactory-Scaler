// OSSFactory-Scaler — Telegram notifications (matches OSS Factory reporting style)

import { OSS_BOT_TOKEN, TELEGRAM_USER_ID, GITHUB_ORG } from "./config";
import { getBudgetSummary, getSpendByTier } from "./token-tracker";
import { formatLeaderboard } from "./slicing-pie";
import { loadState } from "./state";
import type { VDayReport } from "./types";

const API_BASE = "https://api.telegram.org/bot";

function isConfigured(): boolean {
  return Boolean(OSS_BOT_TOKEN && TELEGRAM_USER_ID);
}

export async function sendTelegram(text: string): Promise<boolean> {
  if (!isConfigured()) {
    console.log("[telegram] Not configured, skipping notification");
    return false;
  }
  try {
    const resp = await fetch(`${API_BASE}${OSS_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_USER_ID,
        text: text.slice(0, 4000),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!resp.ok) {
      console.error("[telegram] Send failed:", resp.status);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[telegram] Error:", (err as Error).message);
    return false;
  }
}

export async function sendVDayReport(report: VDayReport): Promise<void> {
  const budget = getBudgetSummary();
  const tiers = getSpendByTier();
  const state = loadState();

  const shipCount = state.completedWork.filter(w => w.result?.startsWith("Shipped")).length;
  const failCount = state.completedWork.filter(w => w.status === "failed").length;
  const queueDepth = state.workQueue.filter(w => w.status === "queued").length;

  // Budget bar
  const pct = budget.pct;
  const filled = Math.round(pct / 5);
  const bar = "\u2593".repeat(Math.min(filled, 20)) + "\u2591".repeat(Math.max(0, 20 - filled));
  const budgetWarn = pct > 80 ? " \u26A0\uFE0F" : "";

  // Model usage
  const modelLines = Object.entries(tiers)
    .sort((a, b) => b[1] - a[1])
    .map(([tier, cost]) => `${tier}($${cost.toFixed(3)})`)
    .join(", ");

  // Builder results summary
  const builders = report.builders ?? [];
  const buildShipped = builders.filter(b => b.result === "shipped").length;
  const buildFailed = builders.filter(b => b.result === "failed").length;
  const buildSkipped = builders.filter(b => b.result === "skipped").length;
  const builderEmoji = buildShipped > 0 ? "\u2705" : buildFailed > 0 ? "\u274C" : "\u23ED\uFE0F";
  const builderLines = builders
    .filter(b => b.attempted)
    .map(b => `  ${b.result === "shipped" ? "\u2705" : "\u274C"} ${b.attempted}${b.repairPasses ? ` (${b.repairPasses} repairs)` : ""}`)
    .join("\n");

  const msg = [
    `\uD83D\uDCC5 <b>OSS Scaler \u2014 ${report.vday}</b>`,
    `\uD83D\uDCB0 $${budget.spent.toFixed(4)} / $${budget.limit} (${pct.toFixed(0)}%)${budgetWarn}`,
    `${bar} ${pct.toFixed(0)}% budget`,
    "",
    `\uD83D\uDD0D <b>Scout:</b> ${report.scout.reposScanned} scanned, ${report.scout.workItemsQueued} queued`,
    `${builderEmoji} <b>Builder:</b> ${buildShipped}\u2705 ${buildFailed}\u274C ${buildSkipped}\u23ED\uFE0F`,
    builderLines || "  (no builds)",
    `\uD83C\uDFAD <b>Critic:</b> ${report.critic.observation.slice(0, 200)}`,
    `\uD83C\uDF10 <b>Demo:</b> ${report.demo.created ? `created ${report.demo.created}` : report.demo.updated ? `updated ${report.demo.updated}` : "none"}`,
    `\uD83D\uDD27 <b>Maintainer:</b> ${report.maintainer.issuesTriaged} triaged, ${report.maintainer.healthChecks} health checks`,
    "",
    `\uD83D\uDCCA Queue: ${queueDepth} | Shipped: ${shipCount} | Failed: ${failCount}`,
    `\uD83E\uDDE0 Models: ${modelLines || "none"}`,
    "",
    `<b>Budget:</b> $${budget.spent.toFixed(4)} spent, $${budget.remaining.toFixed(4)} remaining`,
  ].join("\n");

  await sendTelegram(msg);
}

export async function sendShipNotification(
  repoName: string,
  version: string,
  description: string,
): Promise<void> {
  const state = loadState();
  const budget = getBudgetSummary();
  const shipCount = state.completedWork.filter(w => w.result?.startsWith("Shipped")).length;
  const repoUrl = `https://github.com/${GITHUB_ORG}/${repoName}`;

  const msg = [
    `\u2705 <b>OSS Scaler \u2014 SHIPPED</b>`,
    "",
    `<b>${repoName} ${version}</b>`,
    description,
    "",
    `Repo: ${repoUrl}`,
    "",
    `Total shipped: ${shipCount}`,
    `Budget: $${budget.spent.toFixed(4)} / $${budget.limit}`,
    "",
    `${GITHUB_ORG} OSS Scaler`,
  ].join("\n");

  await sendTelegram(msg);
}

export async function sendMeetingReport(vday: string): Promise<void> {
  const budget = getBudgetSummary();
  const state = loadState();
  const leaderboard = formatLeaderboard();

  const shipCount = state.completedWork.filter(w => w.result?.startsWith("Shipped")).length;
  const failCount = state.completedWork.filter(w => w.status === "failed").length;
  const queueDepth = state.workQueue.filter(w => w.status === "queued").length;
  const repoCount = state.repoAudits.length;
  const avgQuality = state.repoAudits.length > 0
    ? Math.round(state.repoAudits.reduce((s, a) => s + a.qualityScore, 0) / state.repoAudits.length)
    : 0;

  const msg = [
    `\uD83D\uDCC5 <b>OSS Scaler \u2014 Team Meeting</b>`,
    `<b>${vday}</b>`,
    "",
    `\uD83C\uDFC6 <b>Leaderboard:</b>`,
    leaderboard,
    "",
    `\uD83D\uDCCA <b>Stats:</b>`,
    `  Repos tracked: ${repoCount}`,
    `  Avg quality: ${avgQuality}/100`,
    `  Shipped: ${shipCount} | Failed: ${failCount}`,
    `  Queue depth: ${queueDepth}`,
    "",
    `\uD83D\uDCB0 <b>Budget:</b> $${budget.spent.toFixed(4)} / $${budget.limit} (${budget.pct.toFixed(0)}%)`,
    `  ${budget.callCount} API calls today`,
    "",
    `${GITHUB_ORG} OSS Scaler`,
  ].join("\n");

  await sendTelegram(msg);
}

export async function sendAlert(message: string): Promise<void> {
  await sendTelegram(`\u26A0\uFE0F <b>[ALERT]</b> ${message}`);
}
