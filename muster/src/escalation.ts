import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decideBash } from "./bash-policy";
import { writeAtomic, writePhase, type RunPaths } from "./layout";
import { chooseOutcome, type PermissionOption, type PermissionOutcome } from "./outcome";
import { decideNetwork } from "./network-policy";
import { danglingLinkTargetOutside, decidePath, resolveRequestPath, type Decision, type ToolCall } from "./path-policy";
import { awaitAnswerWithin, questionTimeoutMs } from "./question-timeout";
import { resolveAllowedHosts } from "./sandbox";
import { pollMs, type Reason } from "./termination";

const PATH_KINDS = new Set(["edit", "delete", "move", "read", "search"]);
const PATH_KEYS = ["file_path", "notebook_path", "path"];
const MAX_RAW_STRING = 4000;

type ToolCallRequest = ToolCall & { toolCallId?: string; title?: string };
type PermissionParams = { sessionId?: string; toolCall?: ToolCallRequest; options?: PermissionOption[] };
type Verdict = { decision: "allow" | "deny"; by: "answer" | "answer-invalid" };
type Settled = { kind: "answer"; text: string } | { kind: "terminated" };

export type PermissionHandlerOptions = {
  layout: RunPaths;
  worktreeReal: string;
  trackPending: (cancel: () => void) => () => void;
  terminate: (reason: Reason, detail?: string) => Promise<number>;
  logDecision: (msg: object) => Promise<void>;
  env?: { MUSTER_POLL_MS?: string; MUSTER_QUESTION_TIMEOUT_MS?: string };
  allowedHosts?: string[];
};

function policyDecision(toolCall: ToolCallRequest, layout: RunPaths, worktreeReal: string): Decision {
  if (PATH_KINDS.has(toolCall.kind)) return decidePath(toolCall, { worktreeReal, reportPath: layout.report });
  if (toolCall.kind === "execute") return decideBash(toolCall.rawInput?.command, { worktreeReal });
  return { allow: false, reason: `kind ${toolCall.kind} needs an answer` };
}

function displayPath(p: string, worktreeReal: string): string {
  try {
    return resolveRequestPath(p, worktreeReal);
  } catch {
    return danglingLinkTargetOutside(p, worktreeReal) ?? resolve(worktreeReal, p);
  }
}

function requestPaths(toolCall: ToolCallRequest, worktreeReal: string): string[] {
  const out = new Set<string>();
  for (const loc of toolCall.locations ?? []) {
    if (typeof loc.path === "string") out.add(displayPath(loc.path, worktreeReal));
  }
  for (const key of PATH_KEYS) {
    const v = toolCall.rawInput?.[key];
    if (typeof v === "string") out.add(displayPath(v, worktreeReal));
  }
  return [...out];
}

function truncateStrings(v: unknown): unknown {
  if (typeof v === "string") {
    return v.length > MAX_RAW_STRING ? `${v.slice(0, MAX_RAW_STRING)}...[truncated ${v.length - MAX_RAW_STRING} chars]` : v;
  }
  if (Array.isArray(v)) return v.map(truncateStrings);
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, truncateStrings(x)]));
  }
  return v;
}

function parseAnswer(text: string): Verdict {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { decision: "deny", by: "answer-invalid" };
  }
  const decision = (parsed as { decision?: unknown } | null)?.decision;
  if (decision === "allow" || decision === "deny") return { decision, by: "answer" };
  return { decision: "deny", by: "answer-invalid" };
}

export function createPermissionHandler(opts: PermissionHandlerOptions) {
  const { layout, worktreeReal, trackPending, terminate, logDecision } = opts;
  const env = opts.env ?? process.env;
  const poll = pollMs(env);
  let questions = 0;
  let hosts = opts.allowedHosts;
  const allowedHosts = (): string[] => {
    if (hosts === undefined) {
      try {
        hosts = resolveAllowedHosts(process.env);
      } catch {
        hosts = [];
      }
    }
    return hosts;
  };

  const waitForAnswer = (n: number): Promise<Settled> =>
    new Promise((resolve) => {
      let timer: ReturnType<typeof setInterval> | undefined;
      let unregister: (() => void) | undefined;
      const finish = (settled: Settled) => {
        clearInterval(timer);
        unregister?.();
        resolve(settled);
      };
      unregister = trackPending(() => finish({ kind: "terminated" }));
      timer = setInterval(() => {
        if (existsSync(layout.answer(n))) {
          finish({ kind: "answer", text: readFileSync(layout.answer(n), "utf8") });
        }
      }, poll);
    });

  return async (params: unknown, id: string | number): Promise<{ outcome: PermissionOutcome }> => {
    const req = (params ?? {}) as PermissionParams;
    const toolCall: ToolCallRequest = req.toolCall ?? { kind: "other" };
    const options = Array.isArray(req.options) ? req.options : [];
    if (options.length === 0) return { outcome: { outcome: "cancelled" } };

    const network = decideNetwork(toolCall, toolCall.kind === "fetch" ? allowedHosts() : []);
    if (network) {
      await logDecision({ decision: network.decision, by: "policy", ...(network.host ? { host: network.host } : {}) });
      return { outcome: chooseOutcome(options, network.decision) };
    }

    const policy = policyDecision(toolCall, layout, worktreeReal);
    if (policy.allow) {
      await logDecision({ decision: "allow", by: "policy" });
      return { outcome: chooseOutcome(options, "allow") };
    }

    const n = ++questions;
    const question = {
      n,
      requestId: id,
      toolCallId: toolCall.toolCallId,
      kind: toolCall.kind,
      title: toolCall.title ?? "",
      paths: requestPaths(toolCall, worktreeReal),
      reason: policy.reason,
      options,
      rawInput: truncateStrings(toolCall.rawInput ?? {}),
    };
    writeAtomic(layout.question(n), JSON.stringify(question, null, 2) + "\n");
    writePhase(layout, { phase: "question" });

    const settled = await awaitAnswerWithin(waitForAnswer(n), n, terminate, questionTimeoutMs(env));
    if (settled.kind === "terminated") {
      await logDecision({ decision: "cancelled", by: "terminated" });
      return { outcome: { outcome: "cancelled" } };
    }
    const verdict = parseAnswer(settled.text);
    await logDecision({ decision: verdict.decision, by: verdict.by });
    return { outcome: chooseOutcome(options, verdict.decision) };
  };
}
