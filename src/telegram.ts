// OSSFactory-Scaler — Telegram notifications (optional, graceful if no token)

import { OSS_BOT_TOKEN, TELEGRAM_USER_ID } from "./config";

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

export async function sendVDayReport(
  vday: string,
  summary: string,
  budgetSpent: number,
  budgetRemaining: number,
): Promise<void> {
  const msg = [
    `<b>OSS Scaler ${vday}</b>`,
    "",
    summary,
    "",
    `<b>Budget:</b> $${budgetSpent.toFixed(4)} spent, $${budgetRemaining.toFixed(4)} remaining`,
  ].join("\n");
  await sendTelegram(msg);
}

export async function sendMeetingReport(
  vday: string,
  leaderboard: string,
  highlights: string,
): Promise<void> {
  const msg = [
    `<b>Team Meeting — ${vday}</b>`,
    "",
    "<b>Leaderboard:</b>",
    leaderboard,
    "",
    "<b>Highlights:</b>",
    highlights,
  ].join("\n");
  await sendTelegram(msg);
}

export async function sendAlert(message: string): Promise<void> {
  await sendTelegram(`<b>[ALERT]</b> ${message}`);
}
