import { describe, expect, test } from "bun:test";
import { buildFollowup, buildPrompt } from "../src/prompt";
import { UsageError, runPaths } from "../src/layout";

const ticket = "Fix $HOME handling; use `ls` and ${CLAUDE_PLUGIN_ROOT} literally";
const paths = runPaths("a1", { MUSTER_HOME: "/tmp/m1", HOME: "/tmp/h" });
const worktree = paths.worktree;
const reportPath = paths.report;

describe("WorkerPrompt", () => {
  test("T1: ticket appears byte-identical in the prompt", () => {
    const prompt = buildPrompt({ worktree, reportPath, ticket });
    expect(prompt).toContain(ticket);
  });

  test("T2: prompt carries the absolute worktree and the report line from RunLayout", () => {
    const prompt = buildPrompt({ worktree, reportPath, ticket });
    expect(prompt).toContain(worktree);
    expect(prompt.split("\n")).toContain("Report file: /tmp/m1/runs/a1/REPORT.md");
    expect(prompt.split("\n")).toContain(`Report file: ${paths.report}`);
  });

  test("T3: prompt states the first-line DONE/BLOCKED rule and the CLAUDE.md instruction", () => {
    const prompt = buildPrompt({ worktree, reportPath, ticket });
    expect(prompt).toContain("first line");
    expect(prompt).toContain("DONE");
    expect(prompt).toContain("BLOCKED");
    expect(prompt).toContain("CLAUDE.md");
  });

  test("T4: follow-up carries the text verbatim and the same report line", () => {
    const followup = buildFollowup({ text: "do X", reportPath });
    expect(followup).toContain("do X");
    expect(followup.split("\n")).toContain("Report file: /tmp/m1/runs/a1/REPORT.md");
  });

  test("T5: empty ticket or relative worktree throws UsageError", () => {
    expect(() => buildPrompt({ worktree, reportPath, ticket: "" })).toThrow(UsageError);
    expect(() => buildPrompt({ worktree: "relative/wt", reportPath, ticket })).toThrow(UsageError);
  });
});
