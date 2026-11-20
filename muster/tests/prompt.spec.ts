import { describe, expect, test } from "bun:test";
import { buildFollowup, buildPrompt } from "../src/prompt";
import { UsageError, runPaths } from "../src/layout";

const ticket = "Fix $HOME handling; use `ls` and ${CLAUDE_PLUGIN_ROOT} literally";
const paths = runPaths("a1", { MUSTER_HOME: "/tmp/m1", HOME: "/tmp/h" });
const worktree = paths.worktree;
const reportPath = paths.report;

describe("WorkerPrompt", () => {
  test("T1: ticket appears byte-identical in the prompt", () => {
    const prompt = buildPrompt({ worktree, ticket });
    expect(prompt).toContain(ticket);
  });

  test("T2: prompt carries the absolute worktree and names no report file", () => {
    const prompt = buildPrompt({ worktree, ticket });
    expect(prompt).toContain(worktree);
    expect(prompt).not.toContain(reportPath);
    expect(prompt).not.toMatch(/report file|write (your|the|a) .*report/i);
  });

  test("T3: prompt states the first-line DONE/BLOCKED rule and the CLAUDE.md instruction", () => {
    const prompt = buildPrompt({ worktree, ticket });
    expect(prompt).toContain("first line");
    expect(prompt).toContain("DONE");
    expect(prompt).toContain("BLOCKED");
    expect(prompt).toContain("CLAUDE.md");
  });

  test("R1: the turn ends with a final message whose bare first line is DONE or BLOCKED, then only what commits do not show", () => {
    const prompt = buildPrompt({ worktree, ticket });
    expect(prompt).toContain("End each turn with a final message whose first line is exactly DONE or BLOCKED, with nothing else on that line.");
    expect(prompt).toContain("write only what your commits do not show");
    expect(prompt).toMatch(/checks you ran and their results/);
    expect(prompt).toMatch(/left open/);
    expect(prompt).toContain("If a request is refused, do not work around the refusal; end the turn with BLOCKED instead.");
  });

  test("R2: prompt says to load deferred tools with ToolSearch and retry a validation error once", () => {
    const prompt = buildPrompt({ worktree, ticket });
    expect(prompt).toMatch(/ToolSearch/);
    expect(prompt).toMatch(/required parameter/i);
    expect(prompt).toMatch(/deferred|not loaded/i);
    expect(prompt).toMatch(/retry it once/i);
    expect(prompt).toMatch(/not a refusal/i);
  });

  test("T4: follow-up carries the text verbatim and the same final-message rule, naming no report file", () => {
    const followup = buildFollowup({ text: "do X" });
    expect(followup.startsWith("do X\n")).toBe(true);
    expect(followup).toContain("End each turn with a final message whose first line is exactly DONE or BLOCKED");
    expect(followup).not.toContain(reportPath);
  });

  test("W1: the first prompt and the follow-up both say to wait in the foreground, since background work ends with the turn", () => {
    for (const text of [buildPrompt({ worktree, ticket }), buildFollowup({ text: "do X" })]) {
      expect(text).toContain("You are not woken when a background task finishes, and background processes end with the turn.");
      expect(text).toContain("Wait for every command in the foreground before you end your turn.");
    }
  });

  test("T5: empty ticket or relative worktree throws UsageError", () => {
    expect(() => buildPrompt({ worktree, ticket: "" })).toThrow(UsageError);
    expect(() => buildPrompt({ worktree: "relative/wt", ticket })).toThrow(UsageError);
  });

  const networkRules = [/network host/i, /web fetch/i, /web search/i, /work(ed)? around/i, /names? the host|naming the host/i];

  test("T6: prompt carries the network-refusal rule and the BLOCKED path", () => {
    const prompt = buildPrompt({ worktree, ticket });
    for (const rule of networkRules) {
      expect(prompt).toMatch(rule);
    }
    expect(prompt).toContain("BLOCKED");
  });

  test("T7: the T6 regexes fail against the previous revision's prompt", () => {
    const previous = [
      `You are an unattended worker. Work only inside this worktree: ${worktree}`,
      "If CLAUDE.md exists in the worktree, read it first and follow it.",
      "",
      "Ticket:",
      ticket,
      "",
      `Report file: ${reportPath}`,
      "Write your report to that file. Its first line is the single word DONE or BLOCKED, with nothing else on that line. Put the summary on the lines after it.",
      "Example report:",
      "DONE",
      "Created hello.txt with the requested greeting.",
      "Requests outside the worktree may be denied. If a request is refused, do not work around the refusal; record BLOCKED in the report instead.",
    ].join("\n");
    expect(networkRules.some((rule) => !rule.test(previous))).toBe(true);
  });
});
