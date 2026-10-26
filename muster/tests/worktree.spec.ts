import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkerWorktree, fetchBranchBack, WorktreeError } from "../src/worktree";
import { commitFile, git, makeRepo, removeFixtures } from "./support/repo";

afterAll(removeFixtures);

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
    expect(statSync(join(result.worktree, ".git")).isDirectory()).toBe(true);
    expect(git(repo, ["worktree", "list", "--porcelain"])).not.toContain(result.worktree);
    expect(git(result.worktree, ["status", "--porcelain"])).toBe("");
    expect(existsSync(join(result.worktree, "README.md"))).toBe(true);
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

  test("T4: the clone shares no object file with the source", () => {
    const repo = makeRepo();
    git(repo, ["gc", "-q"]);
    const result = createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name: "a4", worktreePath: freshPath() });
    const packDir = join(result.worktree, ".git", "objects", "pack");
    const packs = readdirSync(packDir).filter((f) => f.endsWith(".pack"));

    expect(packs.length).toBeGreaterThan(0);
    for (const pack of packs) expect(statSync(join(packDir, pack)).nlink).toBe(1);
  });

  test("T4b: a failed clone raises WorktreeError carrying git's stderr and leaves no directory", () => {
    const notARepo = mkdtempSync(join(tmpdir(), "muster-notrepo-"));
    const worktreePath = freshPath();

    try {
      createWorkerWorktree({ repoRoot: notARepo, baseRef: "HEAD", name: "a4", worktreePath });
      throw new Error("expected WorktreeError");
    } catch (err) {
      expect(err).toBeInstanceOf(WorktreeError);
    }
    expect(existsSync(worktreePath)).toBe(false);
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

  function localHooksPath(dir: string): string | undefined {
    const proc = Bun.spawnSync(["git", "-C", dir, "config", "--local", "--get", "core.hooksPath"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    return proc.exitCode === 0 ? proc.stdout.toString().trim() : undefined;
  }

  test("H1: the clone keeps the source's local core.hooksPath", () => {
    const repo = makeRepo();
    git(repo, ["config", "core.hooksPath", ".githooks"]);
    const result = createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name: "h1", worktreePath: freshPath() });

    expect(localHooksPath(result.worktree)).toBe(".githooks");
  });

  test("H2: the clone has no local core.hooksPath when the source has none", () => {
    const repo = makeRepo();
    git(repo, ["config", "--unset", "core.hooksPath"]);
    expect(localHooksPath(repo)).toBeUndefined();
    const result = createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name: "h2", worktreePath: freshPath() });

    expect(localHooksPath(result.worktree)).toBeUndefined();
  });
});

describe("fetchBranchBack", () => {
  function runClone(name: string) {
    const repo = makeRepo();
    const result = createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name, worktreePath: freshPath() });
    return { repo, clone: result.worktree, branch: result.branch };
  }

  test("F1: a commit made in the clone shows in git log muster/<name> of the source", () => {
    const { repo, clone, branch } = runClone("f1");
    const sha = commitFile(clone, "work.txt", "done\n", "feat: work");

    expect(fetchBranchBack({ repoRoot: repo, clone, branch })).toEqual({ ok: true, sha });
    expect(git(repo, ["rev-parse", branch])).toBe(sha);
  });

  test("F2: a branch the worker rewrote still comes back", () => {
    const { repo, clone, branch } = runClone("f2");
    commitFile(clone, "work.txt", "one\n", "feat: work");
    expect(fetchBranchBack({ repoRoot: repo, clone, branch })).toMatchObject({ ok: true });
    git(clone, ["commit", "-q", "--amend", "-m", "feat: work amended"]);
    const amended = git(clone, ["rev-parse", "HEAD"]);

    expect(fetchBranchBack({ repoRoot: repo, clone, branch })).toMatchObject({ ok: true });
    expect(git(repo, ["rev-parse", branch])).toBe(amended);
  });

  test("F3: a refused fetch is returned with git's stderr instead of thrown", () => {
    const { repo, clone, branch } = runClone("f3");
    expect(fetchBranchBack({ repoRoot: repo, clone, branch })).toMatchObject({ ok: true });
    git(repo, ["switch", "-q", branch]);
    commitFile(clone, "work.txt", "two\n", "feat: more");

    const result = fetchBranchBack({ repoRoot: repo, clone, branch });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("checked out");
  });

  test("F4: tags made in the clone, including one named muster/<name>, never reach the source", () => {
    const { repo, clone, branch } = runClone("f4");
    const sha = commitFile(clone, "work.txt", "done\n", "feat: work");
    const evil = commitFile(clone, "evil.txt", "evil\n", "feat: evil");
    git(clone, ["tag", "release", sha]);
    git(clone, ["tag", "-a", "-m", "x", "annotated", sha]);
    git(clone, ["tag", branch, sha]);
    git(clone, ["reset", "-q", "--hard", evil]);
    const before = git(repo, ["for-each-ref", "--format=%(refname)"]);

    expect(fetchBranchBack({ repoRoot: repo, clone, branch })).toMatchObject({ ok: true });
    expect(git(repo, ["tag", "--list"])).toBe("");
    expect(git(repo, ["rev-parse", `refs/heads/${branch}`])).toBe(evil);
    expect(git(repo, ["for-each-ref", "--format=%(refname)"]).split("\n").filter((r) => !before.includes(r))).toEqual([
      `refs/heads/${branch}`,
    ]);
  });
});
