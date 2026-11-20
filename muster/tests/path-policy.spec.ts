import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decidePath } from "../src/path-policy";
import { allowAll, decisionTable, runCases, type Env } from "./support/guard-check";

let root: string;
let env: Env;

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "muster-path-policy-")));
  const worktree = join(root, "wt");
  const outsideDir = join(root, "outside");
  mkdirSync(join(worktree, ".git"), { recursive: true });
  mkdirSync(join(worktree, ".claude"));
  mkdirSync(outsideDir);
  mkdirSync(join(root, "wt-sibling"));
  const outsideFile = join(outsideDir, "outside.txt");
  const reportPath = join(outsideDir, "implement-report.md");
  writeFileSync(outsideFile, "");
  writeFileSync(reportPath, "");
  symlinkSync(outsideDir, join(worktree, "link"));
  symlinkSync(join(worktree, ".claude"), join(worktree, "claude-link"));
  const home = join(root, "home");
  mkdirSync(join(home, ".ssh"), { recursive: true });
  mkdirSync(join(home, ".config/gh"), { recursive: true });
  mkdirSync(join(home, ".aws"));
  mkdirSync(join(home, "projects"));
  writeFileSync(join(home, ".ssh/id_x"), "");
  writeFileSync(join(home, ".config/gh/hosts.yml"), "");
  writeFileSync(join(home, ".aws/credentials"), "");
  writeFileSync(join(home, ".npmrc"), "");
  writeFileSync(join(home, ".ssh-notes"), "");
  writeFileSync(join(home, "notes.txt"), "");
  symlinkSync(join(home, ".aws"), join(outsideDir, "aws-link"));
  symlinkSync(join(home, ".aws/credentials"), join(outsideDir, "creds"));
  const userTemp = join(root, "user-temp");
  const sandboxTmp = join(root, "private-tmp/claude-1");
  mkdirSync(userTemp);
  mkdirSync(`${userTemp}-sibling`);
  mkdirSync(sandboxTmp, { recursive: true });
  symlinkSync(join(root, "private-tmp"), join(root, "tmp"));
  symlinkSync(outsideDir, join(userTemp, "out-link"));
  symlinkSync(join(home, "notes.txt"), join(userTemp, "home-file-link"));
  const runsDir = join(root, "muster/runs");
  const runDir = join(runsDir, "r1");
  mkdirSync(join(runDir, "worktree/.git"), { recursive: true });
  writeFileSync(join(runDir, "events.jsonl"), "");
  env = {
    worktree,
    sibling: join(root, "wt-sibling"),
    outsideDir,
    outsideFile,
    reportPath,
    home,
    userTemp,
    sandboxTmp,
    sandboxTmpLink: join(root, "tmp/claude-1"),
    runsDir,
    runDir,
  };
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("decidePath", () => {
  test("decision table: every case gets its expected decision", () => {
    expect(runCases(decidePath, decisionTable(env))).toEqual([]);
  });

  test("red-first: an allow-all guard fails the decision table", () => {
    expect(runCases(allowAll, decisionTable(env)).length).toBeGreaterThan(0);
  });
});
