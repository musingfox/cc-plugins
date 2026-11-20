import { isAbsolute } from "node:path";
import { UsageError } from "./layout";

// muster writes REPORT.md from this final message, so the worker writes no file outside its worktree.
// The client exits when the turn ends, which ends the worker's background processes with it.
const FINAL_MESSAGE = [
  "You are not woken when a background task finishes, and background processes end with the turn.",
  "Wait for every command in the foreground before you end your turn.",
  "End each turn with a final message whose first line is exactly DONE or BLOCKED, with nothing else on that line.",
  "After it, write only what your commits do not show: the checks you ran and their results, what is left open, and the reason when BLOCKED.",
  "Requests outside the worktree may be denied. If a request is refused, do not work around the refusal; end the turn with BLOCKED instead.",
].join("\n");

function requireAbsolute(label: string, value: string): void {
  if (!isAbsolute(value)) {
    throw new UsageError(`${label} must be an absolute path: "${value}"`);
  }
}

export function buildPrompt(input: { worktree: string; ticket: string }): string {
  if (!input.ticket) {
    throw new UsageError("ticket must not be empty");
  }
  requireAbsolute("worktree", input.worktree);
  return [
    `You are an unattended worker. Work only inside this worktree: ${input.worktree}`,
    "If CLAUDE.md exists in the worktree, read it first and follow it.",
    "",
    "Ticket:",
    input.ticket,
    "",
    "Keep your steps in a task list: one short entry per checkable step, created with TodoWrite, or with TaskCreate and TaskUpdate when TodoWrite is not offered. Mark each entry completed as soon as its step is done.",
    "",
    FINAL_MESSAGE,
    "If a tool is reported as deferred or not loaded, load it with ToolSearch first, then call it with all its required parameters. A schema or input-validation error is not a refusal: fix the input and retry it once.",
    "If a network host, web fetch, or web search is refused (a permission denial, not a validation error), do not work around it with another tool, mirror, or host. If you cannot proceed, end the turn with BLOCKED, naming the host.",
  ].join("\n");
}

export function buildFollowup(input: { text: string }): string {
  return [input.text, "", FINAL_MESSAGE].join("\n");
}
