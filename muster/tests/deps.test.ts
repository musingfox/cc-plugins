import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copyDeps } from "../src/deps";
import { createWorkerWorktree, WorktreeError } from "../src/worktree";
import { commitFile, git, makeRepo, mkdirOutsideTemp, removeFixtures } from "./support/repo";

afterAll(removeFixtures);

function cloneOf(repo: string): { clone: string; baseSha: string } {
  const worktreePath = join(mkdirOutsideTemp("muster-deps-"), "wt");
  const wt = createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name: "d1", worktreePath });
  return { clone: wt.worktree, baseSha: wt.baseSha };
}

function writeIn(root: string, rel: string, content: string): void {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), content);
}

describe("copyDeps: CopyMatchingNodeModules", () => {
  test("T1: copies the root node_modules when the root lockfile is tracked", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "lock\n", "add lock");
    writeIn(repo, "node_modules/x/index.js", "source-bytes\n");
    const { clone, baseSha } = cloneOf(repo);

    const outcomes = copyDeps({ repoRoot: repo, baseSha, clone });

    expect(outcomes).toEqual([{ dir: ".", outcome: "copied" }]);
    expect(readFileSync(join(clone, "node_modules/x/index.js"), "utf8")).toBe("source-bytes\n");
  });

  test("T2: copies every lockfile directory in sorted order, including one with a space", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "root\n", "add root lock");
    writeIn(repo, "packages/a b/package-lock.json", "{}\n");
    git(repo, ["add", "packages"]);
    git(repo, ["commit", "-q", "-m", "add package lock"]);
    writeIn(repo, "node_modules/r.txt", "root\n");
    writeIn(repo, "packages/a b/node_modules/p.txt", "pkg\n");
    const { clone, baseSha } = cloneOf(repo);

    const outcomes = copyDeps({ repoRoot: repo, baseSha, clone });

    expect(outcomes).toEqual([
      { dir: ".", outcome: "copied" },
      { dir: "packages/a b", outcome: "copied" },
    ]);
    expect(existsSync(join(clone, "node_modules/r.txt"))).toBe(true);
    expect(existsSync(join(clone, "packages/a b/node_modules/p.txt"))).toBe(true);
  });

  test("T3: a directory tracking two lockfiles yields one copied outcome", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "bun\n", "add bun lock");
    commitFile(repo, "package-lock.json", "{}\n", "add npm lock");
    writeIn(repo, "node_modules/x.txt", "x\n");
    const { clone, baseSha } = cloneOf(repo);

    const outcomes = copyDeps({ repoRoot: repo, baseSha, clone });

    expect(outcomes).toEqual([{ dir: ".", outcome: "copied" }]);
  });

  test("T4: no tracked lockfile gives no outcomes and no node_modules in the clone", () => {
    const repo = makeRepo();
    writeIn(repo, "node_modules/x.txt", "x\n");
    const { clone, baseSha } = cloneOf(repo);

    expect(copyDeps({ repoRoot: repo, baseSha, clone })).toEqual([]);
    expect(existsSync(join(clone, "node_modules"))).toBe(false);
  });

  test("T5: a base sha that does not exist throws WorktreeError", () => {
    const repo = makeRepo();
    const { clone } = cloneOf(repo);

    expect(() =>
      copyDeps({ repoRoot: repo, baseSha: "0000000000000000000000000000000000000000", clone }),
    ).toThrow(WorktreeError);
  });
});
