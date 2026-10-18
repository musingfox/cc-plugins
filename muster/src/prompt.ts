import { isAbsolute } from "node:path";
import { UsageError } from "./layout";

function reportBlock(reportPath: string): string {
  return [
    `Report file: ${reportPath}`,
    "Write your report to that file. Its first line is the single word DONE or BLOCKED, with nothing else on that line. Put the summary on the lines after it.",
    "Example report:",
    "DONE",
    "Created hello.txt with the requested greeting.",
    "Requests outside the worktree may be denied. If a request is refused, do not work around the refusal; record BLOCKED in the report instead.",
  ].join("\n");
}

function requireAbsolute(label: string, value: string): void {
  if (!isAbsolute(value)) {
    throw new UsageError(`${label} must be an absolute path: "${value}"`);
  }
}

export function buildPrompt(input: { worktree: string; reportPath: string; ticket: string }): string {
  if (!input.ticket) {
    throw new UsageError("ticket must not be empty");
  }
  requireAbsolute("worktree", input.worktree);
  requireAbsolute("reportPath", input.reportPath);
  return [
    `You are an unattended worker. Work only inside this worktree: ${input.worktree}`,
    "If CLAUDE.md exists in the worktree, read it first and follow it.",
    "",
    "Ticket:",
    input.ticket,
    "",
    reportBlock(input.reportPath),
  ].join("\n");
}

export function buildFollowup(input: { text: string; reportPath: string }): string {
  requireAbsolute("reportPath", input.reportPath);
  return [input.text, "", reportBlock(input.reportPath)].join("\n");
}
