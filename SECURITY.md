# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email: adam@arpe.engineering
3. Include: description, steps to reproduce, potential impact

We will respond within 48 hours and work on a fix.

## Security Practices

- All secrets loaded from environment variables (`.env` gitignored)
- No API keys, tokens, IP addresses, or passwords in source code
- Security quality gate scans for: `eval()`, hardcoded keys, private keys, IP addresses, hardcoded passwords
- Public repo — assume everything in source is visible

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x.x   | Yes       |
