import { readPhase, writePhase, type Phase, type RunPaths } from "./layout";

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

type Projection = Phase;

// An exited run keeps the phase.json termination wrote; a failed write (the run directory removed) is dropped.
function persist(layout: RunPaths, patch: Phase): void {
  try {
    if (readPhase(layout)?.phase !== "exited") writePhase(layout, patch);
  } catch {
    // The worker keeps running without its band figures.
  }
}

// The figures a phase.json carries; cost and plan appear once they have a value.
const projectionOf = (figures: Figures, plan: Plan | null): Projection => ({
  title: figures.title,
  tools: figures.tools,
  ...(figures.cost === null ? {} : { cost: figures.cost }),
  ...(plan === null ? {} : { plan }),
});

const changedKeys = (prev: Projection, next: Projection): Phase =>
  Object.fromEntries(Object.entries(next).filter(([key, value]) => JSON.stringify(prev[key]) !== JSON.stringify(value)));

// Writes the worker's figures into the run's phase.json as its session/update notifications arrive.
export function createProgressWriter(layout: RunPaths, ticket: string): (params: unknown) => void {
  let figures: Figures = { title: ticketTitle(ticket), tools: 0, cost: null };
  let plan: Plan | null = null;
  let shown = projectionOf(figures, plan);
  persist(layout, shown);
  return (params) => {
    const update = isRecord(params) ? params.update : undefined;
    figures = foldFigures(figures, update);
    plan = foldPlan(plan, update);
    const next = projectionOf(figures, plan);
    const patch = changedKeys(shown, next);
    shown = next;
    if (Object.keys(patch).length > 0) persist(layout, patch);
  };
}
