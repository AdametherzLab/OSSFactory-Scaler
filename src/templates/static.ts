// OSSFactory-Scaler — Static templates for tsconfig, package.json

export function generateTsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        types: ["bun-types"],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: "./dist",
        rootDir: "./src",
        declaration: true,
      },
      include: ["src/**/*.ts"],
      exclude: ["node_modules", "dist"],
    },
    null,
    2,
  );
}

export function generatePackageJson(name: string, description: string, version = "0.1.0"): string {
  return JSON.stringify(
    {
      name,
      version,
      description,
      type: "module",
      main: "src/index.ts",
      scripts: {
        start: "bun run src/index.ts",
        test: "bun test",
        build: "bun build src/index.ts --target bun --outdir dist",
      },
      devDependencies: {
        "bun-types": "latest",
        typescript: "^5.0.0",
      },
      license: "MIT",
    },
    null,
    2,
  );
}
