import { readFileSync, rmSync } from "node:fs";
import { writeAtomic } from "./layout";

export type ReportResult =
  | { kind: "none" }
  | { kind: "done" | "blocked"; body: string }
  | { kind: "malformed"; firstLine: string };

export function readReport(reportPath: string): ReportResult {
  let text: string;
  try {
    text = readFileSync(reportPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { kind: "none" };
    return { kind: "malformed", firstLine: "" };
  }

  const newline = text.indexOf("\n");
  const rawFirst = newline === -1 ? text : text.slice(0, newline);
  const firstLine = rawFirst.replace(/[\r ]+$/, "");
  const body = newline === -1 ? "" : text.slice(newline + 1);

  if (firstLine === "DONE") return { kind: "done", body };
  if (firstLine === "BLOCKED") return { kind: "blocked", body };
  return { kind: "malformed", firstLine };
}

// C0 controls except newline and tab, DEL, and C1 controls (ESC among them): status and the pane print the report.
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

// Each turn replaces the report with the worker's final message, untrusted text stripped of its controls;
// a turn that ended with no agent text leaves no report.
export function writeTurnReport(reportPath: string, message: string): void {
  const text = message.replace(CONTROL, "");
  if (text === "") rmSync(reportPath, { force: true });
  else writeAtomic(reportPath, text);
}
