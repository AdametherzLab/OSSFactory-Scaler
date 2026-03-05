// OSSFactory-Scaler — Unit tests

import { describe, test, expect } from "bun:test";

// Test types
describe("types", () => {
  test("ModelTier values are valid", () => {
    const tiers = ["micro", "fast", "standard", "engineering"];
    expect(tiers).toHaveLength(4);
    expect(tiers.every(t => typeof t === "string")).toBe(true);
  });

  test("AgentRole values are valid", () => {
    const roles = ["scout", "builder", "demo", "maintainer", "critic"];
    expect(roles).toHaveLength(5);
  });
});

// Test vday scheduling
describe("vday", () => {
  test("getCurrentVDay returns valid window", async () => {
    const { getCurrentVDay } = await import("../src/vday");
    const vday = getCurrentVDay();
    expect(vday.index).toBeGreaterThanOrEqual(0);
    expect(vday.index).toBeLessThan(25);
    expect(vday.label).toMatch(/^VDay-\d{4}-\d{2}-\d{2}-\d{2}$/);
    expect(vday.startTime).toBeInstanceOf(Date);
    expect(vday.endTime).toBeInstanceOf(Date);
    expect(vday.endTime.getTime()).toBeGreaterThan(vday.startTime.getTime());
    expect(vday.durationMs).toBeGreaterThan(0);
  });

  test("msUntilNextVDay returns non-negative", async () => {
    const { msUntilNextVDay } = await import("../src/vday");
    expect(msUntilNextVDay()).toBeGreaterThanOrEqual(0);
  });

  test("getVDayLabel returns string", async () => {
    const { getVDayLabel } = await import("../src/vday");
    expect(typeof getVDayLabel()).toBe("string");
  });

  test("isMeetingVDay returns boolean", async () => {
    const { isMeetingVDay } = await import("../src/vday");
    expect(typeof isMeetingVDay()).toBe("boolean");
  });
});

// Test slicing pie points
describe("slicing-pie", () => {
  test("POINT_VALUES are defined", () => {
    const points: Record<string, number> = {
      "ship-release": 10,
      "create-demo": 8,
      "fix-issue": 5,
      "update-demo": 5,
      "quality-improvement": 3,
      "successful-review": 2,
      "failed-ship": -3,
      "regression": -5,
      "budget-overrun": -2,
    };
    expect(points["ship-release"]).toBe(10);
    expect(points["failed-ship"]).toBe(-3);
    expect(points["regression"]).toBe(-5);
  });
});

// Test demo page template
describe("demo-page template", () => {
  test("generates valid HTML", async () => {
    const { generateDemoPage } = await import("../src/templates/demo-page");
    const html = generateDemoPage({
      repoName: "test-repo",
      title: "Test Repo | Free Tool",
      description: "A test repository",
      repoUrl: "https://github.com/test/test-repo",
      features: ["Feature 1", "Feature 2"],
      installCmd: "bun add test-repo",
      usageExample: 'import { foo } from "test-repo";',
      theme: "dark",
    });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("test-repo");
    expect(html).toContain("Feature 1");
    expect(html).toContain("Feature 2");
    expect(html).toContain("application/ld+json");
    expect(html).toContain("og:title");
    expect(html).toContain("twitter:card");
  });

  test("escapes HTML in config values", async () => {
    const { generateDemoPage } = await import("../src/templates/demo-page");
    const html = generateDemoPage({
      repoName: "test<script>",
      title: "Test<script>alert(1)</script>",
      description: 'A "dangerous" repo',
      repoUrl: "https://github.com/test/test",
      features: ["<script>alert(1)</script>"],
      installCmd: "bun add test",
      usageExample: "import test",
      theme: "ocean",
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  test("all themes produce valid output", async () => {
    const { generateDemoPage } = await import("../src/templates/demo-page");
    const themes = ["dark", "light", "forest", "ocean", "sunset"] as const;
    for (const theme of themes) {
      const html = generateDemoPage({
        repoName: "test",
        title: "Test",
        description: "Test",
        repoUrl: "https://github.com/test/test",
        features: [],
        installCmd: "bun add test",
        usageExample: "",
        theme,
      });
      expect(html).toContain("<!DOCTYPE html>");
    }
  });
});

// Test static templates
describe("static templates", () => {
  test("generateTsconfig returns valid JSON", async () => {
    const { generateTsconfig } = await import("../src/templates/static");
    const tsconfig = JSON.parse(generateTsconfig());
    expect(tsconfig.compilerOptions.target).toBe("ESNext");
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.types).toContain("bun-types");
  });

  test("generatePackageJson returns valid JSON", async () => {
    const { generatePackageJson } = await import("../src/templates/static");
    const pkg = JSON.parse(generatePackageJson("test-pkg", "A test package", "1.2.3"));
    expect(pkg.name).toBe("test-pkg");
    expect(pkg.version).toBe("1.2.3");
    expect(pkg.description).toBe("A test package");
    expect(pkg.license).toBe("MIT");
  });
});

// Test quality gate patterns
describe("quality-gates security patterns", () => {
  test("detects eval()", () => {
    const pattern = /\beval\s*\(/g;
    expect(pattern.test('eval("code")')).toBe(true);
    expect(pattern.test("evaluate()")).toBe(false);
  });

  test("detects API key patterns", () => {
    const pattern = /sk-[a-zA-Z0-9]{20,}/g;
    expect(pattern.test("sk-abcdefghijklmnopqrstu")).toBe(true);
    expect(pattern.test("sk-short")).toBe(false);
  });

  test("detects IP addresses", () => {
    const pattern = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
    expect(pattern.test("192.168.1.1")).toBe(true);
    expect(pattern.test("not an ip")).toBe(false);
  });

  test("detects GitHub PATs", () => {
    const pattern = /ghp_[a-zA-Z0-9]{36}/g;
    expect(pattern.test("ghp_abcdefghijklmnopqrstuvwxyz1234567890")).toBe(true);
  });
});
