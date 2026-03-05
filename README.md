# OSSFactory-Scaler

Autonomous AI agent team that scales, maintains, and improves open-source repositories. Runs 25 VDays/day on a $5/day OpenRouter budget with 5 specialized agents.

## Agents

| Agent | Role | Model Tier |
|-------|------|------------|
| **Scout** | Scans repos, audits quality, prioritizes work queue | micro |
| **Builder** | Clones repo, generates upgrades, repair cascade, pushes releases | fast -> standard -> engineering |
| **Demo** | Creates/updates SEO-optimized demo pages, deploys to VPS | fast |
| **Maintainer** | Triages issues, labels, auto-responds, health scoring | micro |
| **Critic** | Reviews Builder output, runs quality gates, daily observation | micro |

## Install

```bash
git clone https://github.com/AdametherzLab/OSSFactory-Scaler.git
cd OSSFactory-Scaler
bash scripts/setup.sh
```

## Configuration

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

Required:
- `OPENROUTER_API_KEY` — Your OpenRouter API key
- `GITHUB_ORG` — GitHub org/user to scan (default: AdametherzLab)

Optional:
- `OSS_BOT_TOKEN` / `TELEGRAM_USER_ID` — Telegram notifications
- `VPS_HOST` / `VPS_USER` / `SSH_KEY_PATH` — Demo page deployment
- `DAILY_BUDGET_USD` — Daily spending limit (default: $5)
- `VDAYS_PER_DAY` — Virtual days per real day (default: 25)

## Usage

```bash
# Run directly
bun run src/index.ts

# Run with PM2
npx pm2 start ecosystem.config.cjs

# Run tests
bun test
```

## How It Works

Each VDay (~58 minutes), the agents run sequentially:

1. **Scout** scans repos via `gh repo list`, audits quality, queues work items
2. **Builder** picks top work item, clones repo, generates upgrade via AI cascade, runs quality gates
3. **Critic** reviews recent work, writes 333-char observation
4. **Demo** generates SEO demo pages for recently shipped repos, deploys via SCP
5. **Maintainer** triages open issues, labels them, computes health scores

Every 5th VDay, a team meeting fires with a Slicing Pie leaderboard.

## Slicing Pie Points

| Action | Points |
|--------|--------|
| Ship a release | +10 |
| Create demo page | +8 |
| Fix/triage an issue | +5 |
| Update demo page | +5 |
| Quality improvement | +3 |
| Successful review | +2 |
| Failed ship | -3 |
| Regression introduced | -5 |
| Budget overrun | -2 |

## Quality Gates

1. **Compile** — `bun build` passes
2. **Tests** — `bun test` with >= 50% pass rate
3. **README** — >= 800 chars with install + usage sections
4. **Security** — No eval(), hardcoded secrets, or IP addresses
5. **Ship-ready** — Composite >= 70/100

## Model Tiers

| Tier | Model | Cost (in/out per 1M) |
|------|-------|---------------------|
| micro | Gemini 2.5 Flash Lite | $0.075 / $0.30 |
| fast | Gemini 2.5 Flash | $0.15 / $0.60 |
| standard | Kimi K2.5 | $0.45 / $2.20 |
| engineering | DeepSeek R1 | $0.55 / $2.19 |

## Data Files

All persisted in `data/` (gitignored):

- `scaler-state.json` — Work queue, audits, completed work
- `token-usage.json` — Per-model spend log
- `slicing-pie.json` — Agent reward history
- `builds/` — Temporary clone directory

## Requirements

- [Bun](https://bun.sh) runtime
- [GitHub CLI](https://cli.github.com) (`gh`) authenticated
- [OpenRouter](https://openrouter.ai) API key

## License

MIT
