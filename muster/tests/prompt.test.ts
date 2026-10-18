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

  test("R1: report instruction pins a bare DONE/BLOCKED first line with a literal example", () => {
    const prompt = buildPrompt({ worktree, reportPath, ticket });
    const lines = prompt.split("\n");
    expect(prompt).toContain("nothing else on that line");
    expect(prompt).toContain("lines after it");
    expect(prompt).not.toContain("followed by a summary");
    const example = lines.indexOf("Example report:");
    expect(example).toBeGreaterThan(-1);
    expect(lines[example + 1]).toBe("DONE");
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

  const networkRules = [/network host/i, /web fetch/i, /web search/i, /work(ed)? around/i, /names? the host|naming the host/i];

  test("T6: prompt carries the network-refusal rule and the BLOCKED path", () => {
    const prompt = buildPrompt({ worktree, reportPath, ticket });
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
