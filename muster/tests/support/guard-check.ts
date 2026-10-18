import { join } from "node:path";
import type { Decision, PathContext, ToolCall } from "../../src/path-policy";

export type Decide = (toolCall: ToolCall, ctx: PathContext) => Decision;

export type Case = {
  name: string;
  toolCall: ToolCall;
  ctx: PathContext;
  expectAllow: boolean;
};

export type Env = {
  worktree: string;
  sibling: string;
  outsideDir: string;
  outsideFile: string;
  reportPath: string;
  reportLink: string;
};

export const allowAll: Decide = () => ({ allow: true });

export function runCases(decide: Decide, cases: Case[]): string[] {
  const failures: string[] = [];
  for (const c of cases) {
    let got: Decision;
    try {
      got = decide(c.toolCall, c.ctx);
    } catch {
      failures.push(`${c.name}: threw instead of returning a decision`);
      continue;
    }
    if (got.allow !== c.expectAllow) {
      failures.push(`${c.name}: expected allow=${c.expectAllow}, got allow=${got.allow}`);
    }
  }
  return failures;
}

export function decisionTable(env: Env): Case[] {
  const wt = env.worktree;
  const ctx: PathContext = { worktreeReal: wt, reportPath: env.reportPath };
  const edit = (path: string): ToolCall => ({ kind: "edit", rawInput: { file_path: path } });
  const deny = (name: string, toolCall: ToolCall, c: PathContext = ctx): Case => ({
    name,
    toolCall,
    ctx: c,
    expectAllow: false,
  });
  const allow = (name: string, toolCall: ToolCall, c: PathContext = ctx): Case => ({
    name,
    toolCall,
    ctx: c,
    expectAllow: true,
  });

  return [
    // T1
    allow("T1 edit of a new file inside the worktree", edit(join(wt, "src/a.ts"))),
    // T2
    deny("T2 dotdot escape", edit(join(wt, "../outside.txt"))),
    deny("T2 absolute outside path", edit(env.outsideFile)),
    deny("T2 sibling directory sharing the worktree prefix", edit(join(env.sibling, "f"))),
    // T3
    deny("T3 path through a symlink leading out", edit(join(wt, "link/f"))),
    // T4
    deny("T4 edit of the worktree .git", edit(join(wt, ".git"))),
    deny("T4 edit inside the worktree .git", edit(join(wt, ".git/config"))),
    // T5
    allow("T5 edit of exactly reportPath", {
      kind: "edit",
      locations: [{ path: env.reportPath }],
    }),
    deny("T5 delete of reportPath", { kind: "delete", locations: [{ path: env.reportPath }] }),
    deny(
      "T5 edit of reportPath that is a symlink",
      { kind: "edit", locations: [{ path: env.reportLink }] },
      { worktreeReal: wt, reportPath: env.reportLink },
    ),
    deny("T5 edit of reportPath + .bak", {
      kind: "edit",
      locations: [{ path: env.reportPath + ".bak" }],
    }),
    // T6
    deny("T6 edit that names no path", { kind: "edit", rawInput: {} }),
    // T7
    deny("T7 two paths, one outside", {
      kind: "edit",
      locations: [{ path: join(wt, "a.ts") }, { path: env.outsideFile }],
    }),
  ];
}
