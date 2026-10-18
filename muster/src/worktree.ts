import { existsSync, realpathSync, rmSync } from "node:fs";

export class WorktreeError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "WorktreeError";
  }
}

export interface WorkerWorktreeInput {
  repoRoot: string;
  baseRef: string;
  name: string;
  worktreePath: string;
}

export interface WorkerWorktree {
  worktree: string;
  branch: string;
  baseSha: string;
}

function git(repoRoot: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  return {
    ok: proc.exitCode === 0,
    stdout: proc.stdout.toString().trim(),
    stderr: proc.stderr.toString().trim(),
  };
}

export function createWorkerWorktree(input: WorkerWorktreeInput): WorkerWorktree {
  const { repoRoot, baseRef, name, worktreePath } = input;
  const branch = `muster/${name}`;

  const base = git(repoRoot, ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]);
  if (!base.ok) {
    throw new WorktreeError(`base ref not found: ${baseRef}`, base.stderr);
  }
  const baseSha = base.stdout;

  const existed = existsSync(worktreePath);
  const add = git(repoRoot, ["worktree", "add", "-b", branch, worktreePath, baseSha]);
  if (!add.ok) {
    if (!existed) rmSync(worktreePath, { recursive: true, force: true });
    throw new WorktreeError(`git worktree add failed for ${branch}: ${add.stderr}`, add.stderr);
  }

  return { worktree: realpathSync(worktreePath), branch, baseSha };
}
