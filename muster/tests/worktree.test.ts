import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkerWorktree, WorktreeError } from "../src/worktree";
import { commitFile, git, makeRepo } from "./support/repo";

function freshPath(): string {
  return join(mkdtempSync(join(tmpdir(), "muster-wt-")), "wt");
}

describe("WorkerWorktree", () => {
  test("T1: creates a checkout on muster/<name> at the base commit", () => {
    const repo = makeRepo();
    const worktreePath = freshPath();
    const result = createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name: "a1", worktreePath });

    expect(git(result.worktree, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("muster/a1");
    expect(result.branch).toBe("muster/a1");
    expect(git(result.worktree, ["rev-parse", "HEAD"])).toBe(result.baseSha);
    expect(git(repo, ["worktree", "list", "--porcelain"])).toContain(result.worktree);
  });

  test("T2: returns the realpath of the worktree path", () => {
    const repo = makeRepo();
    const worktreePath = freshPath();
    const result = createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name: "a2", worktreePath });

    expect(result.worktree).toBe(realpathSync(worktreePath));
  });

  test("T3: uncommitted files in the main repo are absent from the worktree", () => {
    const repo = makeRepo();
    writeFileSync(join(repo, "dirty.txt"), "uncommitted\n");
    const result = createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name: "a3", worktreePath: freshPath() });

    expect(existsSync(join(result.worktree, "dirty.txt"))).toBe(false);
  });

  test("T4: a pre-existing muster/<name> branch raises WorktreeError and leaves no directory", () => {
    const repo = makeRepo();
    git(repo, ["branch", "muster/a1"]);
    const worktreePath = freshPath();

    expect(() =>
      createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name: "a1", worktreePath }),
    ).toThrow(WorktreeError);
    expect(existsSync(worktreePath)).toBe(false);
  });

  test("T4b: the WorktreeError carries git's stderr", () => {
    const repo = makeRepo();
    git(repo, ["branch", "muster/a1"]);

    try {
      createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name: "a1", worktreePath: freshPath() });
      throw new Error("expected WorktreeError");
    } catch (err) {
      expect(err).toBeInstanceOf(WorktreeError);
      expect((err as WorktreeError).stderr).toContain("already exists");
    }
  });

  test("T5: a non-HEAD baseRef checks out that commit", () => {
    const repo = makeRepo();
    const second = commitFile(repo, "second.txt", "two\n", "second");
    const first = git(repo, ["rev-parse", "HEAD~1"]);
    const result = createWorkerWorktree({ repoRoot: repo, baseRef: first, name: "a5", worktreePath: freshPath() });

    expect(result.baseSha).toBe(first);
    expect(git(result.worktree, ["rev-parse", "HEAD"])).toBe(first);
    expect(result.baseSha).not.toBe(second);
  });
});
