# Contributing to OSSFactory-Scaler

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USER/OSSFactory-Scaler.git`
3. Install dependencies: `bun install`
4. Copy `.env.example` to `.env` and configure
5. Run tests: `bun test`

## Development

- Runtime: Bun (no Node.js required)
- Zero runtime npm dependencies — only Bun/Node built-ins
- TypeScript with strict mode

## Pull Requests

- Keep changes focused and minimal
- Run `bun test` before submitting
- Run `bun build src/index.ts --target bun` to verify compilation
- Do not commit `.env` files or any secrets

## Security

- Never hardcode API keys, tokens, IPs, or passwords
- All secrets must come from environment variables
- See SECURITY.md for reporting vulnerabilities

## Code Style

- Use TypeScript with explicit types
- Prefer `const` over `let`
- Use async/await over raw promises
- Keep functions under 50 lines when possible
