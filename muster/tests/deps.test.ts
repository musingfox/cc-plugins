import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cloneDirectory } from "../src/clonefile";
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

describe("copyDeps: RecordCloneFailure", () => {
  test("T1: a failed clone is recorded with its detail and leaves no node_modules", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "lock\n", "add lock");
    writeIn(repo, "node_modules/x.txt", "x\n");
    const { clone, baseSha } = cloneOf(repo);

    const outcomes = copyDeps({ repoRoot: repo, baseSha, clone }, () => ({ ok: false, detail: "errno=18" }));

    expect(outcomes).toEqual([{ dir: ".", outcome: "clonefile-error", detail: "errno=18" }]);
    expect(existsSync(join(clone, "node_modules"))).toBe(false);
  });

  test("T2: the detail returned by the clone adapter is reported verbatim", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "lock\n", "add lock");
    writeIn(repo, "node_modules/x.txt", "x\n");
    const { clone, baseSha } = cloneOf(repo);
    const message = "dlopen(/usr/lib/libSystem.B.dylib): symbol not found";

    const outcomes = copyDeps({ repoRoot: repo, baseSha, clone }, () => ({ ok: false, detail: message }));

    expect(outcomes).toEqual([{ dir: ".", outcome: "clonefile-error", detail: message }]);
  });

  test("T3: a node_modules tracked at the base commit fails with errno=17 and the committed files stay", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "lock\n", "add lock");
    writeIn(repo, "node_modules/committed.txt", "committed\n");
    git(repo, ["add", "node_modules"]);
    git(repo, ["commit", "-q", "-m", "track node_modules"]);
    const { clone, baseSha } = cloneOf(repo);

    const outcomes = copyDeps({ repoRoot: repo, baseSha, clone });

    expect(outcomes).toEqual([{ dir: ".", outcome: "clonefile-error", detail: "errno=17" }]);
    expect(readFileSync(join(clone, "node_modules/committed.txt"), "utf8")).toBe("committed\n");
  });

  test("T4: a failure in one directory does not stop the others", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "root\n", "add root lock");
    writeIn(repo, "packages/a b/package-lock.json", "{}\n");
    git(repo, ["add", "packages"]);
    git(repo, ["commit", "-q", "-m", "add package lock"]);
    writeIn(repo, "node_modules/r.txt", "root\n");
    writeIn(repo, "packages/a b/node_modules/p.txt", "pkg\n");
    const { clone, baseSha } = cloneOf(repo);

    const outcomes = copyDeps({ repoRoot: repo, baseSha, clone }, (src, dst) =>
      src.includes("/packages/a b/")
        ? { ok: false, detail: "errno=18" }
        : (cloneDirectory(src, dst)),
    );

    expect(outcomes).toEqual([
      { dir: ".", outcome: "copied" },
      { dir: "packages/a b", outcome: "clonefile-error", detail: "errno=18" },
    ]);
  });
});

describe("copyDeps: SkipOnLockfileDrift", () => {
  test("T1: an uncommitted edit to the source lockfile skips the copy", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "committed\n", "add lock");
    writeIn(repo, "node_modules/x.txt", "x\n");
    const { clone, baseSha } = cloneOf(repo);
    writeFileSync(join(repo, "bun.lock"), "edited\n");

    expect(copyDeps({ repoRoot: repo, baseSha, clone })).toEqual([
      { dir: ".", outcome: "lockfile-differs", detail: "bun.lock" },
    ]);
    expect(existsSync(join(clone, "node_modules"))).toBe(false);
  });

  test("T2: the comparison binds to the base commit, not to the source HEAD", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "base\n", "add lock");
    writeIn(repo, "node_modules/x.txt", "x\n");
    const { clone, baseSha } = cloneOf(repo);
    commitFile(repo, "bun.lock", "newer\n", "bump lock");

    expect(copyDeps({ repoRoot: repo, baseSha, clone })).toEqual([
      { dir: ".", outcome: "lockfile-differs", detail: "bun.lock" },
    ]);
    expect(existsSync(join(clone, "node_modules"))).toBe(false);
  });

  test("T3: a deleted source lockfile is reported as differing without throwing", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "committed\n", "add lock");
    writeIn(repo, "node_modules/x.txt", "x\n");
    const { clone, baseSha } = cloneOf(repo);
    rmSync(join(repo, "bun.lock"));

    expect(copyDeps({ repoRoot: repo, baseSha, clone })).toEqual([
      { dir: ".", outcome: "lockfile-differs", detail: "bun.lock" },
    ]);
  });

  test("T4: one edited lockfile in a directory skips that directory and names the edited file", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "bun\n", "add bun lock");
    commitFile(repo, "package-lock.json", "{}\n", "add npm lock");
    writeIn(repo, "node_modules/x.txt", "x\n");
    const { clone, baseSha } = cloneOf(repo);
    writeFileSync(join(repo, "package-lock.json"), "{ \"edited\": true }\n");

    expect(copyDeps({ repoRoot: repo, baseSha, clone })).toEqual([
      { dir: ".", outcome: "lockfile-differs", detail: "package-lock.json" },
    ]);
    expect(existsSync(join(clone, "node_modules"))).toBe(false);
  });

  test("T5: a lockfile that only differs by a text/eol filter is not drift", () => {
    const repo = makeRepo();
    commitFile(repo, ".gitattributes", "bun.lock text eol=crlf\n", "add attributes");
    commitFile(repo, "bun.lock", "lock\n", "add lock");
    writeIn(repo, "node_modules/x.txt", "x\n");
    const { clone, baseSha } = cloneOf(repo);
    writeFileSync(join(repo, "bun.lock"), "lock\r\n");

    expect(copyDeps({ repoRoot: repo, baseSha, clone })).toEqual([{ dir: ".", outcome: "copied" }]);
  });
});

describe("copyDeps: SkipUnusableNodeModules", () => {
  test("T1: a directory without node_modules in the source reports no-node-modules", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "lock\n", "add lock");
    const { clone, baseSha } = cloneOf(repo);

    expect(copyDeps({ repoRoot: repo, baseSha, clone })).toEqual([{ dir: ".", outcome: "no-node-modules" }]);
  });

  test("T2: a symlinked node_modules is never cloned", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "lock\n", "add lock");
    const real = join(mkdirOutsideTemp("muster-real-"), "nm");
    writeIn(real, "x.txt", "x\n");
    symlinkSync(real, join(repo, "node_modules"));
    const { clone, baseSha } = cloneOf(repo);
    let calls = 0;

    const outcomes = copyDeps({ repoRoot: repo, baseSha, clone }, () => {
      calls += 1;
      return { ok: true };
    });

    expect(outcomes).toEqual([{ dir: ".", outcome: "no-node-modules", detail: "symlink" }]);
    expect(calls).toBe(0);
    expect(existsSync(join(clone, "node_modules"))).toBe(false);
  });

  test("T3: a regular file named node_modules reports no-node-modules without throwing", () => {
    const repo = makeRepo();
    commitFile(repo, "bun.lock", "lock\n", "add lock");
    writeFileSync(join(repo, "node_modules"), "not a directory\n");
    const { clone, baseSha } = cloneOf(repo);

    expect(copyDeps({ repoRoot: repo, baseSha, clone })).toEqual([{ dir: ".", outcome: "no-node-modules" }]);
  });
});

describe("copyDeps: SkipUnusableNodeModules (path limits)", () => {
  test("R1: a lockfile path that fits PATH_MAX but whose node_modules path does not is an outcome, not a throw", () => {
    const repo = makeRepo();
    const dir = longDir(1020 - repo.length - "//bun.lock".length);
    writeIn(repo, join(dir, "bun.lock"), "lock\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "add lock"]);
    expect(join(repo, dir, "bun.lock").length).toBe(1020);
    const { clone, baseSha } = cloneOf(repo);

    const outcomes = copyDeps({ repoRoot: repo, baseSha, clone });

    expect(outcomes.map((o) => [o.dir, o.outcome])).toEqual([[dir, "no-node-modules"]]);
  });
});

function longDir(length: number): string {
  let dir = "";
  while (dir.length < length) {
    const room = length - dir.length - (dir ? 1 : 0);
    dir += (dir ? "/" : "") + "d".repeat(Math.min(200, room));
  }
  return dir;
}
