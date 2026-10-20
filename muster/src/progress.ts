const TITLE_MAX = 200;

const clip = (text: string): string => Array.from(text).slice(0, TITLE_MAX).join("");

// The ticket's first line with its leading hashes stripped: the title until the worker names one.
export function ticketTitle(ticket: string): string {
  for (const raw of ticket.split(/\r?\n/)) {
    const line = raw.replace(/^[#\s]+/, "").trim();
    if (line) return clip(line);
  }
  return "";
}

export type Plan = { done: number; total: number };

// The worker's task list is a snapshot: each plan update replaces the count.
export function foldPlan(prev: Plan | null, update: unknown): Plan | null {
  const entries = isRecord(update) && update.sessionUpdate === "plan" ? update.entries : undefined;
  if (!Array.isArray(entries)) return prev;
  return { done: entries.filter((entry) => isRecord(entry) && entry.status === "completed").length, total: entries.length };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
