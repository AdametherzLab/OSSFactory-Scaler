// OSSFactory-Scaler — GitHub CLI wrappers (uses `gh`, no tokens in code)

import { GITHUB_ORG, WORK_DIR } from "./config";

async function exec(cmd: string, cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bash", "-c", cmd], {
    cwd: cwd ?? WORK_DIR,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

export interface RepoInfo {
  name: string;
  fullName: string;
  description: string;
  stars: number;
  lastPush: string;
  openIssues: number;
  isArchived: boolean;
  url: string;
}

export async function listRepos(): Promise<RepoInfo[]> {
  const { stdout, exitCode } = await exec(
    `gh repo list ${GITHUB_ORG} --json name,description,stargazerCount,pushedAt,isArchived,url --limit 100 --no-archived`
  );
  if (exitCode !== 0) {
    console.error("[github] Failed to list repos");
    return [];
  }
  try {
    const repos = JSON.parse(stdout);
    return repos.map((r: any) => ({
      name: r.name,
      fullName: `${GITHUB_ORG}/${r.name}`,
      description: r.description ?? "",
      stars: r.stargazerCount ?? 0,
      lastPush: r.pushedAt ?? "",
      openIssues: 0,
      isArchived: r.isArchived ?? false,
      url: r.url ?? "",
    }));
  } catch {
    return [];
  }
}

export async function getRepoIssues(repo: string): Promise<any[]> {
  const { stdout, exitCode } = await exec(
    `gh issue list --repo ${GITHUB_ORG}/${repo} --json number,title,labels,state,createdAt --limit 50`
  );
  if (exitCode !== 0) return [];
  try {
    return JSON.parse(stdout);
  } catch {
    return [];
  }
}

export async function cloneRepo(repo: string): Promise<string> {
  const dest = `${WORK_DIR}/${repo}`;
  await exec(`rm -rf "${dest}"`);
  const { exitCode, stderr } = await exec(
    `gh repo clone ${GITHUB_ORG}/${repo} "${dest}"`
  );
  if (exitCode !== 0) throw new Error(`Clone failed: ${stderr}`);
  return dest;
}

export async function getReadme(repo: string, cloneDir: string): Promise<string> {
  const { stdout } = await exec("cat README.md 2>/dev/null || echo ''", cloneDir);
  return stdout;
}

export async function getPackageJson(cloneDir: string): Promise<Record<string, unknown> | null> {
  const { stdout, exitCode } = await exec("cat package.json 2>/dev/null", cloneDir);
  if (exitCode !== 0) return null;
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

export async function commitAndPush(cloneDir: string, message: string, files: string[] = ["."]): Promise<boolean> {
  for (const f of files) {
    await exec(`git add "${f}"`, cloneDir);
  }
  const { exitCode: commitCode } = await exec(
    `git commit -m "${message.replace(/"/g, '\\"')}"`,
    cloneDir
  );
  if (commitCode !== 0) return false;
  const { exitCode: pushCode } = await exec("git push", cloneDir);
  return pushCode === 0;
}

export async function createRelease(
  repo: string,
  tag: string,
  title: string,
  notes: string,
  cloneDir: string,
): Promise<boolean> {
  const { exitCode: tagCode } = await exec(`git tag ${tag}`, cloneDir);
  if (tagCode !== 0) return false;
  await exec("git push --tags", cloneDir);
  const { exitCode } = await exec(
    `gh release create ${tag} --repo ${GITHUB_ORG}/${repo} --title "${title.replace(/"/g, '\\"')}" --notes "${notes.replace(/"/g, '\\"')}"`,
    cloneDir
  );
  return exitCode === 0;
}

export async function labelIssue(repo: string, issueNumber: number, labels: string[]): Promise<void> {
  const labelStr = labels.map(l => `"${l}"`).join(",");
  await exec(`gh issue edit ${issueNumber} --repo ${GITHUB_ORG}/${repo} --add-label ${labelStr}`);
}

export async function commentOnIssue(repo: string, issueNumber: number, body: string): Promise<void> {
  await exec(
    `gh issue comment ${issueNumber} --repo ${GITHUB_ORG}/${repo} --body "${body.replace(/"/g, '\\"')}"`,
  );
}

export async function listSourceFiles(cloneDir: string): Promise<string[]> {
  const { stdout } = await exec(
    `find . -name "*.ts" -o -name "*.js" | grep -v node_modules | grep -v .git | head -50`,
    cloneDir,
  );
  return stdout.split("\n").filter(Boolean);
}

export async function listTestFiles(cloneDir: string): Promise<string[]> {
  const { stdout } = await exec(
    `find . -name "*.test.ts" -o -name "*.test.js" -o -name "*.spec.ts" | grep -v node_modules | head -20`,
    cloneDir,
  );
  return stdout.split("\n").filter(Boolean);
}
