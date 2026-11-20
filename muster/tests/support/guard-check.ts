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
  home: string;
  userTemp: string;
  sandboxTmp: string;
  sandboxTmpLink: string;
  runsDir: string;
  runDir: string;
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
  const ctx: PathContext = {
    worktreeReal: wt,
    home: env.home,
    tempRoots: [env.userTemp, env.sandboxTmpLink],
    runsDir: env.runsDir,
  };
  const worktreeOnly: PathContext = { worktreeReal: wt };
  // An --unfenced run accepts a MUSTER_HOME under temp, so its runs directory can sit inside a temp root.
  const runsInTemp: PathContext = { ...ctx, runsDir: join(env.userTemp, "muster/runs") };
  const edit = (path: string): ToolCall => ({ kind: "edit", rawInput: { file_path: path } });
  const read = (path: string): ToolCall => ({ kind: "read", rawInput: { file_path: path } });
  const search = (path: string): ToolCall => ({ kind: "search", rawInput: { path } });
  const home = env.home;
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
    // T4 for .claude
    deny("T4 edit of the worktree .claude", edit(join(wt, ".claude"))),
    deny("T4 edit inside the worktree .claude", edit(join(wt, ".claude/settings.json"))),
    deny("T4 edit of a new file deep inside the worktree .claude", edit(join(wt, ".claude/skills/x/SKILL.md"))),
    deny("T4 edit through a symlink to the worktree .claude", edit(join(wt, "claude-link/settings.json"))),
    ...["read", "delete", "move", "search"].flatMap((kind) => [
      deny(`T4 ${kind} inside the worktree .git`, { kind, rawInput: { path: join(wt, ".git/HEAD") } }),
      deny(`T4 ${kind} inside the worktree .claude`, { kind, rawInput: { path: join(wt, ".claude/settings.json") } }),
    ]),
    allow("T4 edit of a sibling that only shares the .claude prefix", edit(join(wt, ".claude-notes/a.md"))),
    allow("T4 edit of .claude below another directory", edit(join(wt, "docs/.claude/a.md"))),
    // T5: the run's report is muster's to write, so an edit of it is denied like any path outside the worktree
    deny("T5 edit of the run's report path", { kind: "edit", locations: [{ path: env.reportPath }], rawInput: { file_path: env.reportPath } }),
    // T6
    deny("T6 edit that names no path", { kind: "edit", rawInput: {} }),
    // T7
    deny("T7 two paths, one outside", {
      kind: "edit",
      locations: [{ path: join(wt, "a.ts") }, { path: env.outsideFile }],
    }),
    // R1: fenced Bash reads anything but the credential stores, so a file-tool read may too
    allow("R1 read of a file under home", read(join(home, "notes.txt"))),
    allow("R1 read of a file outside the worktree and home", read(env.outsideFile)),
    allow("R1 read through a worktree symlink leading out", read(join(wt, "link/outside.txt"))),
    // A search outside the worktree still asks: its pattern or glob can name paths beyond the checked path.
    deny("R1 search of a directory under home", search(join(home, "projects"))),
    deny("R1 search outside the worktree with a glob climbing into a store", { kind: "search", rawInput: { path: join(home, "projects"), glob: "../.ssh/*" } }),
    allow("R1 read of a file in the run's own directory", read(join(env.runDir, "events.jsonl"))),
    allow("R1 read of a file whose name only shares a credential store's prefix", read(join(home, ".ssh-notes"))),
    deny("R1 read of ~/.ssh/id_x", read(join(home, ".ssh/id_x"))),
    deny("R1 read of ~/.ssh itself", read(join(home, ".ssh"))),
    deny("R1 read of a missing file inside ~/.ssh", read(join(home, ".ssh/missing/key"))),
    deny("R1 read of a file under ~/.config/gh", read(join(home, ".config/gh/hosts.yml"))),
    deny("R1 read of ~/.npmrc", read(join(home, ".npmrc"))),
    deny("R1 read of ~/.ssh spelled in another case", read(join(home, ".SSH/id_x"))),
    deny("R1 read of a symlink outside the worktree that resolves into ~/.aws", read(join(env.outsideDir, "aws-link/credentials"))),
    deny("R1 read of a file symlink outside the worktree that resolves into ~/.aws", read(join(env.outsideDir, "creds"))),
    deny("R1 search of ~/.ssh", search(join(home, ".ssh"))),
    deny("R1 search of home, which holds the credential stores", search(home)),
    deny("R1 read of ~/.config, which holds ~/.config/gh", read(join(home, ".config"))),
    deny("R1 read of a file inside ~/.ssh with one path outside it", {
      kind: "read",
      locations: [{ path: join(home, "notes.txt") }, { path: join(home, ".ssh/id_x") }],
    }),
    deny("R1 read outside the worktree when the context names no home", read(join(home, "notes.txt")), worktreeOnly),
    deny("R1 read of ~/.ssh when the context's home is relative", read(join(home, ".ssh/id_x")), { ...ctx, home: "" }),
    // R2: fenced Bash writes the per-user temp dir and the sandbox TMPDIR, so a file-tool edit may too
    allow("R2 edit of a file under the per-user temp dir", edit(join(env.userTemp, "scratch.txt"))),
    allow("R2 edit of a new file deep under the per-user temp dir", edit(join(env.userTemp, "a/b/c.txt"))),
    allow("R2 edit of a file under the sandbox TMPDIR, named by its realpath", edit(join(env.sandboxTmp, "x.json"))),
    allow("R2 edit of a file under the sandbox TMPDIR, named through its symlink", edit(join(env.sandboxTmpLink, "x.json"))),
    deny("R2 edit of a file under home", edit(join(home, "notes.txt"))),
    deny("R2 edit of a file under <RUNDIR>", edit(join(env.runDir, "ANSWER-1.json"))),
    deny("R2 edit of the runs directory", edit(env.runsDir)),
    deny("R2 edit under a runs directory that sits inside a temp root", edit(join(env.userTemp, "muster/runs/r1/ANSWER-1.json")), runsInTemp),
    deny("R2 edit of a temp-dir symlink that resolves outside the temp dir", edit(join(env.userTemp, "out-link/f"))),
    deny("R2 edit of a temp-dir file symlink that resolves into home", edit(join(env.userTemp, "home-file-link"))),
    deny("R2 edit of a file whose directory only shares the temp dir's prefix", edit(`${env.userTemp}-sibling/f`)),
    deny("R2 edit with one path in the temp dir and one under home", {
      kind: "edit",
      locations: [{ path: join(env.userTemp, "a") }, { path: join(home, "b") }],
    }),
    deny("R2 edit under the temp dir when the context names no temp roots", edit(join(env.userTemp, "scratch.txt")), worktreeOnly),
    deny("R2 edit under the cwd when a temp root is relative", edit(join(process.cwd(), "scratch.txt")), { ...ctx, tempRoots: [""] }),
    deny("R2 edit under the temp dir when the runs directory is relative", edit(join(env.userTemp, "scratch.txt")), {
      ...ctx,
      runsDir: "",
    }),
    // R3: moves and deletes outside the worktree always ask
    ...["move", "delete"].flatMap((kind) => [
      deny(`R3 ${kind} under the per-user temp dir`, { kind, rawInput: { path: join(env.userTemp, "scratch.txt") } }),
      deny(`R3 ${kind} under the sandbox TMPDIR`, { kind, rawInput: { path: join(env.sandboxTmp, "x.json") } }),
      deny(`R3 ${kind} under home`, { kind, rawInput: { path: join(home, "notes.txt") } }),
    ]),
    // R4: the worktree rules hold with the wider context, and for a worktree under the runs directory
    allow("R4 edit inside a worktree under the runs directory", edit(join(env.runDir, "worktree/a.ts")), {
      ...ctx,
      worktreeReal: join(env.runDir, "worktree"),
    }),
    deny("R4 edit of the .git of a worktree under the runs directory", edit(join(env.runDir, "worktree/.git/config")), {
      ...ctx,
      worktreeReal: join(env.runDir, "worktree"),
    }),
  ];
}
