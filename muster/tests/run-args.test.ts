import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, symlinkSync, mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageError, runPaths } from "../src/layout";
import { parseRunArgs } from "../src/run-args";

let home: string;
let env: { MUSTER_HOME: string; HOME: string };
let repo: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "muster-args-"));
  env = { MUSTER_HOME: join(home, "m"), HOME: home };
  repo = join(home, "repo");
  mkdirSync(repo);
  execFileSync("git", ["-C", repo, "init", "-q"]);
  const tree = execFileSync("git", ["-C", repo, "write-tree"], { encoding: "utf8" }).trim();
  const commit = execFileSync(
    "git",
    ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit-tree", tree, "-m", "init"],
    { encoding: "utf8" },
  ).trim();
  execFileSync("git", ["-C", repo, "update-ref", "HEAD", commit]);
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function valid(extra: string[] = [], name = "a1"): string[] {
  return ["run", "--name", name, "--model", "haiku", "--repo", repo, "--ticket", "do it", ...extra];
}

function refusal(argv: string[]): UsageError {
  try {
    parseRunArgs(argv, env);
  } catch (e) {
    if (e instanceof UsageError) return e;
    throw e;
  }
  throw new Error("expected a refusal");
}

describe("RunRefusal", () => {
  test("T1: missing --model is refused and no run dir is created", () => {
    const argv = ["run", "--name", "a1", "--repo", repo, "--ticket", "t"];
    expect(refusal(argv).message).toContain("--model is required");
    expect(existsSync(runPaths("a1", env).runDir)).toBe(false);
  });

  test("T2: empty --model and --model default are refused; default names 'default'", () => {
    const withModel = (model: string) => ["run", "--name", "a1", "--model", model, "--repo", repo, "--ticket", "t"];
    expect(refusal(withModel("")).message).toContain("--model");
    expect(refusal(withModel("default")).message).toContain("default");
  });

  test("T3: invalid name is refused; a taken name is refused with 'exists' and its dir is untouched", () => {
    expect(() => parseRunArgs(valid([], "../x"), env)).toThrow(UsageError);

    const first = parseRunArgs(valid(), env);
    expect(first.name).toBe("a1");
    const p = runPaths("a1", env);
    mkdirSync(p.runDir, { recursive: true });
    writeFileSync(join(p.runDir, "marker"), "keep");

    expect(refusal(valid()).message).toContain("exists");
    expect(readFileSync(join(p.runDir, "marker"), "utf8")).toBe("keep");
  });

  test("T4: a non-git --repo is refused with 'not a git'", () => {
    const plain = mkdtempSync(join(tmpdir(), "muster-plain-"));
    try {
      const argv = ["run", "--name", "a1", "--model", "haiku", "--repo", plain, "--ticket", "t"];
      expect(refusal(argv).message).toContain("not a git");
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });

  test("T5: an unresolvable --base is refused with 'base ref'", () => {
    expect(refusal(valid(["--base", "nope"])).message).toContain("base ref");
    expect(existsSync(runPaths("a1", env).runDir)).toBe(false);
  });

  test("T6: no ticket, both ticket forms, and an empty --ticket are each refused", () => {
    const base = ["run", "--name", "a1", "--model", "haiku", "--repo", repo];
    expect(() => parseRunArgs(base, env)).toThrow(UsageError);

    const file = join(home, "ticket.md");
    writeFileSync(file, "from file");
    expect(() => parseRunArgs([...base, "--ticket", "t", "--ticket-file", file], env)).toThrow(UsageError);
    expect(() => parseRunArgs([...base, "--ticket", ""], env)).toThrow(UsageError);
  });

  test("T7: valid argv parses to a DispatchRequest without creating a run dir", () => {
    const req = parseRunArgs(valid(), env);
    expect(req).toEqual({
      name: "a1",
      model: "haiku",
      repoRoot: realpathSync(repo),
      baseRef: "HEAD",
      ticket: "do it",
    });
    expect(existsSync(runPaths("a1", env).runDir)).toBe(false);
  });

  test("R1: a name whose muster/<name> branch exists in the repo is refused and no run dir is created", () => {
    execFileSync("git", ["-C", repo, "branch", "muster/a1"]);
    const err = refusal(valid());
    expect(err.message).toContain("muster/a1");
    expect(err.message).toContain("already exists");
    expect(existsSync(runPaths("a1", env).runDir)).toBe(false);
  });

  test("B2a: a --repo under /tmp is refused and no run dir is created", () => {
    const inTmp = mkdtempSync("/tmp/muster-args-");
    try {
      execFileSync("git", ["-C", inTmp, "init", "-q"]);
      const err = refusal(["run", "--name", "a1", "--model", "haiku", "--repo", inTmp, "--ticket", "t"]);
      expect(err.message).toContain("--repo");
      expect(err.message).toContain("temp directory");
      expect(existsSync(runPaths("a1", env).runDir)).toBe(false);
    } finally {
      rmSync(inTmp, { recursive: true, force: true });
    }
  });

  test("B2b: a --repo reached through a symlink is judged by its realpath against $TMPDIR", () => {
    const link = join(home, "link");
    symlinkSync(repo, link);
    const argv = ["run", "--name", "a1", "--model", "haiku", "--repo", link, "--ticket", "t"];
    expect(parseRunArgs(argv, env).repoRoot).toBe(realpathSync(repo));
    env = { ...env, TMPDIR: realpathSync(home) };
    expect(refusal(argv).message).toContain("temp directory");
  });

  test("B2c: a MUSTER_HOME under /tmp that does not exist yet is refused", () => {
    env = { ...env, MUSTER_HOME: "/tmp/muster-args-nonexistent/m" };
    const err = refusal(valid());
    expect(err.message).toContain("MUSTER_HOME");
    expect(err.message).toContain("temp directory");
  });
});
