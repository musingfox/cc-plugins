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
  const reportLink = join(root, "report-link.md");
  symlinkSync(outsideFile, reportLink);
  symlinkSync(outsideDir, join(worktree, "link"));
  symlinkSync(join(worktree, ".claude"), join(worktree, "claude-link"));
  env = {
    worktree,
    sibling: join(root, "wt-sibling"),
    outsideDir,
    outsideFile,
    reportPath,
    reportLink,
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
