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

export type Figures = { title: string; tools: number; cost: number | null };

// Each figure follows the worker's own updates; an update that moves none of them returns prev unchanged.
export function foldFigures(prev: Figures, update: unknown): Figures {
  if (!isRecord(update)) return prev;
  switch (update.sessionUpdate) {
    case "session_info_update":
      return typeof update.title === "string" && update.title.trim() !== "" ? { ...prev, title: clip(update.title) } : prev;
    case "tool_call":
      return { ...prev, tools: prev.tools + 1 };
    case "usage_update": {
      const amount = isRecord(update.cost) ? update.cost.amount : undefined;
      return typeof amount === "number" && Number.isFinite(amount) ? { ...prev, cost: amount } : prev;
    }
    default:
      return prev;
  }
}
