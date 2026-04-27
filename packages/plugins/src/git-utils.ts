import Bun from "bun";

export function spawn(args: string[], cwd: string) {
  return new Promise<{ ok: boolean; stdout: string; stderr: string }>((resolve) => {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    proc.exited.then((code) => {
      const stdout = new Response(proc.stdout).text();
      const stderr = new Response(proc.stderr).text();
      Promise.all([stdout, stderr]).then(([out, err]) =>
        resolve({ ok: code === 0, stdout: out, stderr: err }),
      );
    });
  });
}

export interface DiffInfo {
  stat: string;
  diff: string;
  truncated: boolean;
}

export async function getSmartDiff(
  directory: string,
  maxSize = 12000,
  options?: { stagedOnly?: boolean },
): Promise<DiffInfo> {
  const stagedOnly = options?.stagedOnly ?? true;
  const statArgs = stagedOnly ? ["diff", "--stat", "--cached"] : ["diff", "--stat"];
  const diffArgs = stagedOnly ? ["diff", "--cached", "-U1"] : ["diff", "-U1"];

  const [statResult, diffResult] = await Promise.all([
    spawn(statArgs, directory),
    spawn(diffArgs, directory),
  ]);

  if (!statResult.ok) {
    throw new Error(`git diff --stat failed: ${statResult.stderr}`);
  }
  if (!diffResult.ok) {
    throw new Error(`git diff failed: ${diffResult.stderr}`);
  }

  const stat = statResult.stdout;
  const rawDiff = diffResult.stdout;

  if (rawDiff.length <= maxSize) {
    return { stat, diff: rawDiff, truncated: false };
  }

  return {
    stat,
    diff:
      rawDiff.slice(0, maxSize) +
      `\n\n[TRUNCATED — full diff ${rawDiff.length} chars, showing ${maxSize}. See stat summary for overview.]`,
    truncated: true,
  };
}

const UNMERGED = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

export async function hasUncommittedChanges(directory: string) {
  const r = await spawn(["status", "--porcelain"], directory);
  if (!r.ok) throw new Error(`git status failed: ${r.stderr}`);

  const lines = r.stdout.trim().split("\n").filter(Boolean);
  let staged = false;
  let unstaged = false;
  let untracked = false;
  let conflicted = false;

  for (const line of lines) {
    const xy = line.slice(0, 2);
    const x = xy[0] ?? " ";
    const y = xy[1] ?? " ";

    if (UNMERGED.has(xy)) {
      conflicted = true;
      continue;
    }
    if ("MADRC".includes(x)) staged = true;
    if (y !== " " && y !== "?" && y !== "!") unstaged = true;
    if (x === "?" || y === "?") untracked = true;
  }

  return {
    has: staged || unstaged || untracked || conflicted,
    staged,
    unstaged,
    untracked,
    conflicted,
  };
}
