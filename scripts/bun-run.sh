#!/bin/bash
set -e
cd "$(dirname "$0")/.."
[ -f .env ] && source .env
exec bun run src/index.ts
