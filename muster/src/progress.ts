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

// The figures earlier turns left in phase.json; a new client's turn adds its own on top of them.
type Carried = { title?: string; tools: number; cost: number | null; plan: Plan | null };

function carriedFrom(prior: Phase | undefined): Carried {
  const plan = isRecord(prior?.plan) && typeof prior.plan.done === "number" && typeof prior.plan.total === "number"
    ? { done: prior.plan.done, total: prior.plan.total }
    : null;
  return {
    title: typeof prior?.title === "string" && prior.title !== "" ? prior.title : undefined,
    tools: typeof prior?.tools === "number" ? prior.tools : 0,
    cost: typeof prior?.cost === "number" ? prior.cost : null,
    plan,
  };
}

// The figures a phase.json carries; cost and plan appear once they have a value. The adapter's cost is its own
// process's total, so a resumed client's cost adds to what the earlier clients spent.
const projectionOf = (figures: Figures, plan: Plan | null, carried: Carried): Projection => {
  const cost = figures.cost === null ? carried.cost : (carried.cost ?? 0) + figures.cost;
  const shownPlan = plan ?? carried.plan;
  return {
    title: figures.title,
    tools: carried.tools + figures.tools,
    ...(cost === null ? {} : { cost }),
    ...(shownPlan === null ? {} : { plan: shownPlan }),
  };
};

const changedKeys = (prev: Projection, next: Projection): Phase =>
  Object.fromEntries(Object.entries(next).filter(([key, value]) => JSON.stringify(prev[key]) !== JSON.stringify(value)));

// Writes the worker's figures into the run's phase.json as its session/update notifications arrive. prior is the
// phase.json a follow-up starts from: its title, tools, cost and plan carry over.
export function createProgressWriter(layout: RunPaths, ticket: string, prior?: Phase): (params: unknown) => void {
  const carried = carriedFrom(prior);
  let figures: Figures = { title: carried.title ?? ticketTitle(ticket), tools: 0, cost: null };
  let plan: Plan | null = null;
  let shown = projectionOf(figures, plan, carried);
  persist(layout, shown);
  return (params) => {
    const update = isRecord(params) ? params.update : undefined;
    figures = foldFigures(figures, update);
    plan = foldPlan(plan, update);
    const next = projectionOf(figures, plan, carried);
    const patch = changedKeys(shown, next);
    shown = next;
    if (Object.keys(patch).length > 0) persist(layout, patch);
  };
}

export type Reply = { id: string | undefined; text: string; open: boolean };

// The last agent message so far. Chunks join while their messageId holds; a chunk without one joins the
// message before it only until another update comes between.
export function foldReply(prev: Reply | null, update: unknown): Reply | null {
  if (!isRecord(update)) return prev;
  if (update.sessionUpdate !== "agent_message_chunk") return prev?.open ? { ...prev, open: false } : prev;
  const content = update.content;
  if (!isRecord(content) || content.type !== "text" || typeof content.text !== "string") return prev;
  const id = typeof update.messageId === "string" ? update.messageId : undefined;
  const same = prev !== null && (id !== undefined ? prev.id === id : prev.id === undefined && prev.open);
  return { id, text: same ? prev.text + content.text : content.text, open: true };
}

// Collects the turn's final agent message from its session/update notifications; take() hands it over
// and starts the next turn empty.
export function createReplyReader(): { observe: (params: unknown) => void; take: () => string } {
  let reply: Reply | null = null;
  return {
    observe: (params) => {
      reply = foldReply(reply, isRecord(params) ? params.update : undefined);
    },
    take: () => {
      const text = reply?.text ?? "";
      reply = null;
      return text;
    },
  };
}
