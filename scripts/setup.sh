#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "OSSFactory-Scaler — First-time setup"

if ! command -v bun &> /dev/null; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
fi

if ! command -v gh &> /dev/null; then
  echo "ERROR: GitHub CLI (gh) is required. Install it first."
  exit 1
fi

echo "Installing dependencies..."
bun install

echo "Checking gh auth..."
gh auth status || echo "Run 'gh auth login' to authenticate."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from template — edit it with your keys."
fi

mkdir -p data
echo "Setup complete. Run 'bun run src/index.ts' to start."
