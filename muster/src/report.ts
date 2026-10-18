import { readFileSync } from "node:fs";

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
