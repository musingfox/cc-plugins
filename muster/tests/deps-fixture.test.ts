import { afterAll, describe, expect, test } from "bun:test";
import { dirname, join } from "node:path";
import { readFileSync, statSync, existsSync } from "node:fs";
import { copyDeps } from "../src/deps";
import { createWorkerWorktree } from "../src/worktree";
import { checkDepsIsolation, treeSnapshot } from "../e2e/receipts";
import { depsTicketSteps, writeDepsFixture } from "../e2e/deps-fixture";
import { git, makeRepo, mkdirOutsideTemp, removeFixtures } from "./support/repo";

afterAll(removeFixtures);

function committedFixture(): string {
  const repo = makeRepo();
  writeDepsFixture(repo);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "add fixture"]);
  return repo;
}

function cloneWithDeps(repo: string): string {
  const worktreePath = join(mkdirOutsideTemp("muster-fixture-"), "wt");
  const wt = createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name: "f1", worktreePath });
  copyDeps({ repoRoot: repo, baseSha: wt.baseSha, clone: wt.worktree });
  return wt.worktree;
}

function runSteps(clone: string, first: number): void {
  const path = `${dirname(process.execPath)}:${process.env.PATH ?? ""}`;
  for (const line of depsTicketSteps(first)) {
    const command = line.split("nothing else: ")[1];
    const proc = Bun.spawnSync(["bash", "-c", command], { cwd: clone, env: { ...process.env, PATH: path }, stderr: "pipe" });
    expect(proc.exitCode).toBe(0);
  }
}

describe("writeDepsFixture: DepsFixture", () => {
  test("T1: the fixture commits cleanly, ignores node_modules, and keeps hardlinked pairs", () => {
    const repo = committedFixture();

    expect(git(repo, ["status", "--porcelain"])).toBe("");
    expect(git(repo, ["ls-tree", "-r", "--name-only", "HEAD"]).split("\n").filter((p) => p.startsWith("node_modules/"))).toEqual([]);
    for (const [a, b] of [
      ["a.bin", "b.bin"],
      ["c.bin", "d.bin"],
      ["e.bin", "f.bin"],
    ]) {
      const pa = statSync(join(repo, "node_modules/fixture-dep", a));
      const pb = statSync(join(repo, "node_modules/fixture-dep", b));
      expect(pa.nlink).toBe(2);
      expect(pa.ino).toBe(pb.ino);
    }
  });

  test("T2: the committed fixture clones and copies its node_modules as one directory", () => {
    const repo = committedFixture();
    const worktreePath = join(mkdirOutsideTemp("muster-fixture-"), "wt");
    const wt = createWorkerWorktree({ repoRoot: repo, baseRef: "HEAD", name: "f2", worktreePath });

    expect(copyDeps({ repoRoot: repo, baseSha: wt.baseSha, clone: wt.worktree })).toEqual([{ dir: ".", outcome: "copied" }]);
  });

  test("T3: the four ticket steps run in the clone with their expected effects", () => {
    const repo = committedFixture();
    const clone = cloneWithDeps(repo);

    runSteps(clone, 20);

    expect(readFileSync(join(clone, "deps-import.txt"), "utf8").trim()).toBe("fixture-dep-ok");
    expect(readFileSync(join(clone, "node_modules/fixture-dep/a.bin"), "utf8").endsWith("tampered\n")).toBe(true);
    expect(statSync(join(clone, "node_modules/fixture-dep/c.bin")).size).toBe(0);
    expect(existsSync(join(clone, "node_modules/fixture-dep/e.bin"))).toBe(false);
  });

  test("T4: the ticket steps leave the source node_modules unchanged and its pairs linked", () => {
    const repo = committedFixture();
    const clone = cloneWithDeps(repo);
    const before = treeSnapshot(join(repo, "node_modules"));

    runSteps(clone, 20);

    expect(checkDepsIsolation({ before, after: treeSnapshot(join(repo, "node_modules")) }).ok).toBe(true);
    for (const name of ["a.bin", "c.bin", "e.bin"]) {
      expect(statSync(join(repo, "node_modules/fixture-dep", name)).nlink).toBe(2);
    }
  });

  test("T5: the steps are numbered from the first number, and a missing repo throws", () => {
    const lines = depsTicketSteps(20);

    expect(lines).toHaveLength(4);
    expect(lines[0].startsWith("20. ")).toBe(true);
    expect(lines[3].startsWith("23. ")).toBe(true);
    expect(() => writeDepsFixture(join(mkdirOutsideTemp("muster-fixture-"), "missing"))).toThrow();
  });
});
