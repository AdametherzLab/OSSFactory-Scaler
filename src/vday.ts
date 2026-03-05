// OSSFactory-Scaler — VDay scheduling (25 VDays/day, Central Time)

import type { VDayWindow } from "./types";

const VDAYS_PER_DAY = parseInt(process.env.VDAYS_PER_DAY ?? "25", 10);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VDAY_DURATION_MS = MS_PER_DAY / VDAYS_PER_DAY; // ~57.6 min

function getCentralMidnight(): Date {
  const now = new Date();
  const ct = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  ct.setHours(0, 0, 0, 0);
  const offset = now.getTime() - ct.getTime();
  return new Date(now.getTime() - (now.getTime() - offset) % MS_PER_DAY + (ct.getTime() - now.getTime() + offset));
}

function getDayStart(): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const y = parseInt(parts.find(p => p.type === "year")!.value);
  const m = parseInt(parts.find(p => p.type === "month")!.value) - 1;
  const d = parseInt(parts.find(p => p.type === "day")!.value);

  const midnight = new Date(Date.UTC(y, m, d, 6, 0, 0)); // CT midnight = UTC 06:00
  if (midnight.getTime() > now.getTime()) {
    midnight.setUTCDate(midnight.getUTCDate() - 1);
  }
  return midnight.getTime();
}

export function getCurrentVDay(): VDayWindow {
  const dayStart = getDayStart();
  const elapsed = Date.now() - dayStart;
  const index = Math.floor(elapsed / VDAY_DURATION_MS);
  const clamped = Math.min(Math.max(index, 0), VDAYS_PER_DAY - 1);

  const startTime = new Date(dayStart + clamped * VDAY_DURATION_MS);
  const endTime = new Date(startTime.getTime() + VDAY_DURATION_MS);
  const dateStr = new Date().toISOString().slice(0, 10);

  return {
    index: clamped,
    label: `VDay-${dateStr}-${String(clamped + 1).padStart(2, "0")}`,
    startTime,
    endTime,
    durationMs: VDAY_DURATION_MS,
  };
}

export function msUntilNextVDay(): number {
  const vday = getCurrentVDay();
  return Math.max(0, vday.endTime.getTime() - Date.now());
}

export function getVDayLabel(): string {
  return getCurrentVDay().label;
}

export function isLastVDay(): boolean {
  return getCurrentVDay().index === VDAYS_PER_DAY - 1;
}

export function isMeetingVDay(): boolean {
  return (getCurrentVDay().index + 1) % 5 === 0;
}
