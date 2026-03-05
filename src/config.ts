// OSSFactory-Scaler — Configuration from env vars

import { mkdirSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

export const DATA_DIR = join(ROOT, "data");
mkdirSync(DATA_DIR, { recursive: true });

function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

export const OPENROUTER_API_KEY = env("OPENROUTER_API_KEY");
export const OPENROUTER_APP_TITLE = env("OPENROUTER_APP_TITLE", "OSSFactory-Scaler");
export const GITHUB_ORG = env("GITHUB_ORG", "AdametherzLab");
export const DAILY_BUDGET_USD = parseFloat(env("DAILY_BUDGET_USD", "5"));
export const VDAYS_PER_DAY = parseInt(env("VDAYS_PER_DAY", "25"), 10);

export const OSS_BOT_TOKEN = process.env.OSS_BOT_TOKEN ?? "";
export const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID ?? "";

export const VPS_HOST = process.env.VPS_HOST ?? "";
export const VPS_USER = process.env.VPS_USER ?? "root";
export const SSH_KEY_PATH = process.env.SSH_KEY_PATH ?? "";

export const DEMO_DEPLOY_PATH = "/opt/che0md/site/pages/oss";
export const WORK_DIR = join(DATA_DIR, "builds");
mkdirSync(WORK_DIR, { recursive: true });

export const BUDGET_PER_VDAY = DAILY_BUDGET_USD / VDAYS_PER_DAY;

export const LOG_LEVEL = env("LOG_LEVEL", "info") as "debug" | "info" | "warn" | "error";
