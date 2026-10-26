import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../src/worktree";
import { createRunDir, runPaths, writeAtomic, writePhase } from "../src/layout";
import { cleanVerb } from "../src/verbs/clean";

const CLI = join(import.meta.dir, "..", "src", "muster.ts");

let home: string;
let repo: string;
let env: { MUSTER_HOME: string; HOME: string };

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "muster-clean-"));
  env = { MUSTER_HOME: home, HOME: home };
  repo = join(home, "repo");
  mkdirSync(repo);
  gitIn(repo, ["init", "-q", "-b", "main"]);
  commit(repo, "base");
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function gitIn(dir: string, args: string[]): string {
  const r = git(dir, ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args]);
  if (!r.ok) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function commit(dir: string, msg: string): string {
  gitIn(dir, ["commit", "-q", "--allow-empty", "-m", msg]);
  return gitIn(dir, ["rev-parse", "HEAD"]);
}

function deadPid(): number {
  const proc = Bun.spawnSync(["true"]);
  return proc.pid;
}

// A real clone at <RUNDIR>/worktree on branch muster/NAME; the repo gets the branch when fetched is true.
function makeBranchRun(name: string, phase: Record<string, unknown>, fetched: boolean) {
  const p = runPaths(name, env);
  createRunDir(p);
  const baseSha = gitIn(repo, ["rev-parse", "HEAD"]);
  writeAtomic(p.meta, JSON.stringify({ baseSha, repoRoot: repo }));
  gitIn(home, ["clone", "-q", repo, p.worktree]);
  gitIn(p.worktree, ["switch", "-q", "-c", `muster/${name}`]);
  const head = commit(p.worktree, "work");
  if (fetched) gitIn(repo, ["fetch", "-q", p.worktree, `+refs/heads/muster/${name}:refs/heads/muster/${name}`]);
  writePhase(p, phase);
  return { p, head, baseSha };
}

function makeRun(name: string, phase: Record<string, unknown>) {
  const p = runPaths(name, env);
  createRunDir(p);
  writeAtomic(p.meta, JSON.stringify({ baseSha: "abc123", repoRoot: repo }));
  mkdirSync(join(p.worktree, "sub"), { recursive: true });
  writeFileSync(join(p.worktree, "sub", "f.txt"), "x");
  writePhase(p, phase);
  return p;
}

describe("CleanCommand", () => {
  test("K1: an exited run is removed with everything under it; one stdout line names RUNDIR, base and head", () => {
    const { p, head, baseSha } = makeBranchRun("a1", { phase: "exited", fetched: true }, true);
    writeFileSync(p.report, "DONE\nok\n");
    const r = cleanVerb("a1", env);
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toBe("");
    expect(r.stdout).toBe(`removed ${p.runDir} base=${baseSha} head=${head}\n`);
    expect(existsSync(p.runDir)).toBe(false);
  });

  test("K1: an exited run with no head prints head=unknown", () => {
    const p = makeRun("a1", { phase: "exited" });
    const r = cleanVerb("a1", env);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe(`removed ${p.runDir} base=abc123 head=unknown\n`);
    expect(existsSync(p.runDir)).toBe(false);
  });

  test("K2: a missing run is refused with one stderr line and a non-zero exit", () => {
    const r = cleanVerb("nope", env);
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("no such run");
    expect(r.stderr.trimEnd().split("\n")).toHaveLength(1);
  });

  for (const phase of ["starting", "running", "question", "idle"]) {
    test(`K2: a run in phase ${phase} is refused and nothing is removed`, () => {
      const p = makeRun("a1", { phase, pid: process.pid });
      const r = cleanVerb("a1", env);
      expect(r.exitCode).not.toBe(0);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain("still running");
      expect(r.stderr.trimEnd().split("\n")).toHaveLength(1);
      expect(existsSync(p.worktree)).toBe(true);
    });
  }

  test("K2: a run whose phase.json is missing is refused and nothing is removed", () => {
    const p = makeRun("a1", { phase: "exited" });
    rmSync(p.phase);
    const r = cleanVerb("a1", env);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("still running");
    expect(existsSync(p.worktree)).toBe(true);
  });

  test("K2: a run whose phase.json is unreadable is refused and nothing is removed", () => {
    const p = makeRun("a1", { phase: "exited" });
    writeFileSync(p.phase, "{not json");
    const r = cleanVerb("a1", env);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("still running");
    expect(existsSync(p.worktree)).toBe(true);
  });

  test("K1: an exited run with no fetch recorded but the branch already in the repo is removed", () => {
    const { p, head, baseSha } = makeBranchRun("a1", { phase: "exited" }, true);
    const r = cleanVerb("a1", env);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBe(`removed ${p.runDir} base=${baseSha} head=${head}\n`);
    expect(existsSync(p.runDir)).toBe(false);
  });

  test("K1: the repo branch being ahead of the clone's still counts as fetched", () => {
    const { p } = makeBranchRun("a1", { phase: "exited" }, true);
    gitIn(repo, ["switch", "-q", "muster/a1"]);
    commit(repo, "more");
    expect(cleanVerb("a1", env).exitCode).toBe(0);
    expect(existsSync(p.runDir)).toBe(false);
  });

  test("K2: an exited run whose clone is one commit ahead of the repo is refused and nothing is removed", () => {
    const { p } = makeBranchRun("a1", { phase: "exited", fetched: true }, true);
    commit(p.worktree, "late");
    const r = cleanVerb("a1", env);
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("by hand");
    expect(r.stderr.trimEnd().split("\n")).toHaveLength(1);
    expect(existsSync(p.worktree)).toBe(true);
  });

  test("K2: an exited run whose branch is absent from the repo is refused and nothing is removed", () => {
    const { p } = makeBranchRun("a1", { phase: "exited", fetched: true }, false);
    const r = cleanVerb("a1", env);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("by hand");
    expect(existsSync(p.worktree)).toBe(true);
  });

  test("K1: a fetchError run whose branch was then fetched by hand is removed", () => {
    const { p } = makeBranchRun("a1", { phase: "exited", fetched: true, fetchError: "fetch failed" }, true);
    expect(cleanVerb("a1", env).exitCode).toBe(0);
    expect(existsSync(p.runDir)).toBe(false);
  });

  test("K2: a fetchError run whose branch is not in the repo is refused", () => {
    const { p } = makeBranchRun("a1", { phase: "exited", fetched: true, fetchError: "fetch failed" }, false);
    expect(cleanVerb("a1", env).exitCode).not.toBe(0);
    expect(existsSync(p.worktree)).toBe(true);
  });

  test("K1: a dead run (recorded pid gone) whose branch is fetched is removed", () => {
    const { p } = makeBranchRun("a1", { phase: "running", pid: deadPid() }, true);
    expect(cleanVerb("a1", env).exitCode).toBe(0);
    expect(existsSync(p.runDir)).toBe(false);
  });

  test("K2: a dead run whose clone is ahead of the repo is refused", () => {
    const { p } = makeBranchRun("a1", { phase: "running", pid: deadPid() }, false);
    const r = cleanVerb("a1", env);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("by hand");
    expect(existsSync(p.worktree)).toBe(true);
  });

  test("K2: a run with a live pid and a non-exited phase is refused", () => {
    const { p } = makeBranchRun("a1", { phase: "running", pid: process.pid }, true);
    const r = cleanVerb("a1", env);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("still running");
    expect(existsSync(p.worktree)).toBe(true);
  });

  test("K2: unreadable meta.json refuses because the repository is unknown", () => {
    const p = makeRun("a1", { phase: "exited" });
    writeFileSync(p.meta, "{not json");
    const r = cleanVerb("a1", env);
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("meta.json");
    expect(existsSync(p.worktree)).toBe(true);
  });

  test("K1: a missing worktree directory satisfies the branch check", () => {
    const p = makeRun("a1", { phase: "exited" });
    rmSync(p.worktree, { recursive: true });
    const r = cleanVerb("a1", env);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("head=unknown");
    expect(existsSync(p.runDir)).toBe(false);
  });

  test("K1: a fetchError in phase.json plays no part when the clone has no branch", () => {
    const p = makeRun("a1", { phase: "exited", fetchError: "fetch failed" });
    expect(cleanVerb("a1", env).exitCode).toBe(0);
    expect(existsSync(p.runDir)).toBe(false);
  });

  test("K1: a non-string fetchError does not block removal", () => {
    const p = makeRun("a1", { phase: "exited", fetchError: null });
    expect(cleanVerb("a1", env).exitCode).toBe(0);
    expect(existsSync(p.runDir)).toBe(false);
  });

  test("K3: `muster clean` with no NAME prints usage and exits 2", () => {
    const r = Bun.spawnSync(["bun", CLI, "clean"], { env: { ...process.env, MUSTER_HOME: home }, stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("usage");
    expect(r.stderr.toString()).toContain("clean");
    expect(r.stdout.toString()).toBe("");
  });

  test("K1: the CLI dispatches clean NAME", () => {
    const p = makeRun("a1", { phase: "exited" });
    const r = Bun.spawnSync(["bun", CLI, "clean", "a1"], { env: { ...process.env, MUSTER_HOME: home }, stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.toString()).toStartWith("removed ");
    expect(existsSync(p.runDir)).toBe(false);
  });

  test("K4: SKILL.md Cleanup uses the clean verb, not rm -rf, and names the refusals", () => {
    const skill = require("node:fs").readFileSync(join(import.meta.dir, "..", "skills", "muster", "SKILL.md"), "utf8") as string;
    const section = skill.slice(skill.indexOf("## Cleanup"), skill.indexOf("## Confinement"));
    expect(section).toContain("bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts clean NAME");
    expect(section).not.toContain("rm -rf");
    expect(section).toContain("refuses");
    expect(section).toContain("fetch");
    expect(section).not.toContain("remove the run directory yourself");
  });
});
