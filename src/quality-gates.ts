// OSSFactory-Scaler — Quality gates: compile, tests, readme, security, ship-ready

import type { QualityGateResult, ShipReadiness } from "./types";

async function exec(cmd: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bash", "-c", cmd], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

export async function gateCompile(cloneDir: string): Promise<QualityGateResult> {
  // Try multiple common entry points
  const entries = ["src/index.ts", "index.ts", "src/main.ts", "main.ts", "mod.ts"];
  for (const entry of entries) {
    const { exitCode } = await exec(`test -f "${entry}" && echo found`, cloneDir);
    if (exitCode === 0) {
      const { exitCode: buildCode, stderr } = await exec(
        `bun build "${entry}" --target bun --outdir /tmp/oss-scaler-gate 2>&1; rm -rf /tmp/oss-scaler-gate`,
        cloneDir,
      );
      return {
        gate: "compile",
        passed: buildCode === 0,
        score: buildCode === 0 ? 100 : 0,
        details: buildCode === 0 ? `Compiles clean (${entry})` : `Compile errors: ${stderr.slice(0, 300)}`,
      };
    }
  }
  // No entry point found — not a compile failure, just not applicable
  return { gate: "compile", passed: true, score: 80, details: "No standard entry point found" };
}

export async function gateTests(cloneDir: string): Promise<QualityGateResult> {
  const { stdout, exitCode } = await exec("bun test 2>&1", cloneDir);

  if (exitCode === 0) {
    return { gate: "tests", passed: true, score: 100, details: "All tests pass" };
  }

  const passMatch = stdout.match(/(\d+)\s+pass/);
  const failMatch = stdout.match(/(\d+)\s+fail/);
  const passes = passMatch ? parseInt(passMatch[1]) : 0;
  const fails = failMatch ? parseInt(failMatch[1]) : 0;
  const total = passes + fails;

  if (total === 0) {
    return { gate: "tests", passed: true, score: 50, details: "No tests found (acceptable)" };
  }

  const rate = passes / total;
  const passed = passes >= 3 && rate >= 0.5;
  return {
    gate: "tests",
    passed,
    score: Math.round(rate * 100),
    details: `${passes}/${total} tests pass (${Math.round(rate * 100)}%)`,
  };
}

export async function gateReadme(cloneDir: string): Promise<QualityGateResult> {
  const { stdout, exitCode } = await exec("cat README.md 2>/dev/null", cloneDir);
  if (exitCode !== 0 || !stdout) {
    return { gate: "readme", passed: false, score: 0, details: "No README.md found" };
  }

  const len = stdout.length;
  const hasInstall = /install/i.test(stdout);
  const hasUsage = /usage|example|quick.?start/i.test(stdout);
  let score = 0;
  if (len >= 800) score += 40;
  else if (len >= 400) score += 20;
  if (hasInstall) score += 30;
  if (hasUsage) score += 30;

  return {
    gate: "readme",
    passed: len >= 800 && hasInstall && hasUsage,
    score,
    details: `${len} chars, install:${hasInstall}, usage:${hasUsage}`,
  };
}

const SECURITY_PATTERNS = [
  { pattern: /\beval\s*\(/g, name: "eval()" },
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: "API key literal" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: "GitHub PAT" },
  { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, name: "Private key" },
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, name: "IP address" },
  { pattern: /password\s*[:=]\s*["'][^"']+["']/gi, name: "Hardcoded password" },
];

export async function gateSecurity(cloneDir: string): Promise<QualityGateResult> {
  const { stdout } = await exec(
    `find . -name "*.ts" -o -name "*.js" | grep -v node_modules | grep -v .git | head -30`,
    cloneDir,
  );
  const files = stdout.split("\n").filter(Boolean);
  const findings: string[] = [];

  for (const file of files) {
    const { stdout: content } = await exec(`cat "${file}" 2>/dev/null`, cloneDir);
    for (const { pattern, name } of SECURITY_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        findings.push(`${file}: ${name}`);
      }
    }
  }

  return {
    gate: "security",
    passed: findings.length === 0,
    score: findings.length === 0 ? 100 : Math.max(0, 100 - findings.length * 25),
    details: findings.length === 0 ? "No issues" : findings.join("; ").slice(0, 500),
  };
}

export async function checkShipReady(cloneDir: string): Promise<ShipReadiness> {
  const gates = await Promise.all([
    gateCompile(cloneDir),
    gateTests(cloneDir),
    gateReadme(cloneDir),
    gateSecurity(cloneDir),
  ]);

  const weights = { compile: 30, tests: 25, readme: 20, security: 25 };
  let compositeScore = 0;
  for (const g of gates) {
    compositeScore += (g.score / 100) * (weights[g.gate as keyof typeof weights] ?? 25);
  }
  compositeScore = Math.round(compositeScore);

  return {
    gates,
    compositeScore,
    // Ship if composite >= 80 outright, or >= 70 with all non-test gates passing
    ready: compositeScore >= 80 || (compositeScore >= 70 && gates.every(g => g.gate === "tests" || g.passed)),
  };
}
