// Pure checkers over events.jsonl lines for e2e/accept.ts. Each returns a named failure
// instead of throwing, so the unit tests can assert which check tripped.

export type Event = { t?: string; dir: string; msg: any };
export type Question = { kind?: string; title?: string; paths?: string[]; rawInput?: Record<string, any> };
export type Result = { ok: true; detail: string } | { ok: false; failure: string; detail: string };

const pass = (detail: string): Result => ({ ok: true, detail });
const fail = (failure: string, detail: string): Result => ({ ok: false, failure, detail });

export function parseEvents(text: string): Event[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Event);
}

type Attempt = { command: string; status?: string; output: string; failed: boolean };

// The command text arrives in a later tool_call_update than the first tool_call, so the
// updates are joined by toolCallId and the status is the last one seen for that id.
function attemptsFor(events: Event[], needle: string): Attempt[] {
  const byId = new Map<string, { command: string; status?: string; outputs: string[] }>();
  for (const e of events) {
    if (e.dir !== "in" || e.msg?.method !== "session/update") continue;
    const u = e.msg.params?.update;
    if (typeof u?.toolCallId !== "string") continue;
    const rec = byId.get(u.toolCallId) ?? { command: "", outputs: [] };
    if (typeof u.rawInput?.command === "string") rec.command = u.rawInput.command;
    if (typeof u.status === "string") rec.status = u.status;
    if (typeof u.rawOutput === "string") rec.outputs.push(u.rawOutput);
    const resp = u._meta?.claudeCode?.toolResponse;
    if (resp) rec.outputs.push(`${resp.stdout ?? ""}\n${resp.stderr ?? ""}`);
    byId.set(u.toolCallId, rec);
  }
  return [...byId.values()]
    .filter((rec) => rec.command.includes(needle))
    .map((rec) => {
      const output = rec.outputs.join("\n");
      return {
        command: rec.command,
        status: rec.status,
        output,
        failed: rec.status === "failed" || /Operation not permitted/.test(output),
      };
    });
}

const lastLine = (output: string): string => output.trim().split("\n").pop()?.trim() ?? "";

const describeAttempts = (attempts: Attempt[]): string =>
  attempts.map((a) => `status=${a.status ?? "none"} last=${lastLine(a.output)}`).join("; ");

type Request = { index: number; id: number; toolCall: Record<string, any>; options: Array<{ optionId: string; kind: string }> };

function requestsOf(events: Event[]): Request[] {
  const out: Request[] = [];
  events.forEach((e, index) => {
    if (e.dir === "in" && e.msg?.method === "session/request_permission") {
      out.push({ index, id: e.msg.id, toolCall: e.msg.params?.toolCall ?? {}, options: e.msg.params?.options ?? [] });
    }
  });
  return out;
}

// Reply ids are only unique per direction, so the reply is searched after the request line.
function replyKind(events: Event[], req: Request): string | undefined {
  const reply = events
    .slice(req.index + 1)
    .find((e) => e.dir === "out" && e.msg?.method === undefined && e.msg?.id === req.id);
  if (reply === undefined) return undefined;
  const outcome = reply.msg.result?.outcome;
  if (outcome?.outcome !== "selected") return "cancelled";
  return req.options.find((o) => o.optionId === outcome.optionId)?.kind ?? "unknown-option";
}

// The policy writes its client-decision between the request and its reply, so the first one after the request is its own.
function decisionAfter(events: Event[], req: Request): { decision?: string; by?: string; host?: string } | undefined {
  for (const e of events.slice(req.index + 1)) {
    if (e.dir === "out" && e.msg?.method === undefined && e.msg?.id === req.id) return undefined;
    if (e.dir === "client-decision") return e.msg;
  }
  return undefined;
}

const mentions = (value: unknown, text: string): boolean => JSON.stringify(value ?? null).includes(text);

const hostOf = (url: unknown): string | undefined => {
  if (typeof url !== "string") return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
};

// Network permission requests carry the host in rawInput.host or rawInput.url. WebFetch
// requests are fetch-kind and are checked by checkFetch, so they are not host requests here.
function hostRequests(events: Event[], host: string): Request[] {
  return requestsOf(events).filter(
    (r) => r.toolCall.kind !== "fetch" && (r.toolCall.rawInput?.host === host || hostOf(r.toolCall.rawInput?.url) === host),
  );
}

export function checkBlockedWrite(o: { events: Event[]; needle: string; targetExists: boolean }): Result {
  const attempts = attemptsFor(o.events, o.needle);
  if (attempts.length === 0) return fail("not-attempted", `no Bash command contains ${o.needle}`);
  if (!attempts.some((a) => a.failed)) return fail("not-blocked", describeAttempts(attempts));
  if (o.targetExists) return fail("file-exists", o.needle);
  return pass(`attempted and failed, no file: ${o.needle}`);
}

export function checkCompleted(o: { events: Event[]; needle: string }): Result {
  const attempts = attemptsFor(o.events, o.needle);
  if (attempts.length === 0) return fail("not-attempted", `no Bash command contains ${o.needle}`);
  if (!attempts.some((a) => a.status === "completed")) return fail("not-completed", describeAttempts(attempts));
  return pass(`completed: ${o.needle}`);
}

// A probe to an allowlisted host must neither ask nor be questioned; its output is a note, not an assertion.
export function checkAllowlistedProbe(o: { events: Event[]; needle: string; host: string; questions: Question[] }): Result {
  const attempts = attemptsFor(o.events, o.needle);
  if (attempts.length === 0) return fail("not-attempted", `no Bash command contains ${o.needle}`);
  const hostReqs = hostRequests(o.events, o.host);
  if (hostReqs.length > 0) return fail("host-permission-request", JSON.stringify(hostReqs.map((r) => r.toolCall)));
  if (o.questions.some((q) => mentions(q, o.host))) return fail("question-names-host", o.host);
  return pass(`reachability note for ${o.host}: ${describeAttempts(attempts)}`);
}

// A probe to a non-allowlisted host must fail, print 000, or be rejected by policy; a 200 with none of those fails.
export function checkBlockedProbe(o: { events: Event[]; needle: string; host: string; questions: Question[] }): Result {
  const attempts = attemptsFor(o.events, o.needle);
  if (attempts.length === 0) return fail("not-attempted", `no Bash command contains ${o.needle}`);
  const policyRejected = hostRequests(o.events, o.host).some((r) => {
    const d = decisionAfter(o.events, r);
    return d?.decision === "deny" && d.by === "policy";
  });
  const blocked = attempts.some((a) => a.failed || lastLine(a.output) === "000") || policyRejected;
  if (!blocked) return fail("probe-not-blocked", describeAttempts(attempts));
  if (o.questions.some((q) => mentions(q, o.host))) return fail("question-names-host", o.host);
  return pass(`blocked: ${describeAttempts(attempts)}`);
}

export function checkFetch(o: { events: Event[]; url: string; expect: "allow" | "reject"; questions: Question[] }): Result {
  const host = hostOf(o.url);
  const req = requestsOf(o.events).find((r) => r.toolCall.kind === "fetch" && hostOf(r.toolCall.rawInput?.url) === host);
  if (req === undefined) return fail("no-fetch-request", `no fetch permission request for ${host}`);
  const kind = replyKind(o.events, req);
  if (kind === undefined) return fail("fetch-unanswered", `${host}`);
  const d = decisionAfter(o.events, req);
  if (d !== undefined && JSON.stringify(d).includes(o.url)) return fail("decision-leaks-url", JSON.stringify(d));
  const detail = `${host}: reply=${kind} decision=${JSON.stringify(d ?? null)}`;
  if (o.questions.some((q) => q.kind === "fetch" || mentions(q, host ?? ""))) return fail("question-for-fetch", detail);
  if (o.expect === "allow") {
    if (kind !== "allow_once" || d?.decision !== "allow" || d.by !== "policy") return fail("fetch-not-allowed", detail);
  } else if (kind !== "reject_once" || d?.decision !== "deny" || d.by !== "policy") {
    return fail("fetch-not-rejected", detail);
  }
  return pass(detail);
}

export function checkWebSearch(o: { events: Event[]; questions: Question[] }): Result {
  const attempted = o.events.some(
    (e) =>
      e.dir === "in" &&
      e.msg?.method === "session/update" &&
      (e.msg.params?.update?.name === "WebSearch" || e.msg.params?.update?._meta?.claudeCode?.toolName === "WebSearch"),
  );
  const reqs = requestsOf(o.events).filter((r) => r.toolCall.name === "WebSearch" || r.toolCall.rawInput?.query !== undefined);
  if (!attempted && reqs.length === 0) return pass("websearch-not-attempted");
  if (reqs.length === 0) return fail("websearch-not-denied", "attempted without a permission request");
  for (const req of reqs) {
    const d = decisionAfter(o.events, req);
    if (replyKind(o.events, req) !== "reject_once" || d?.decision !== "deny" || d.by !== "policy") {
      return fail("websearch-not-denied", JSON.stringify(d ?? null));
    }
  }
  if (o.questions.some((q) => q.rawInput?.query !== undefined)) return fail("websearch-question", "a QUESTION names the search");
  return pass(`websearch denied by policy (${reqs.length})`);
}

const DEFAULT_DOMAINS = ["registry.npmjs.org", "github.com", "codeload.github.com"];
const WORKER_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "ToolSearch"];

export function checkSessionSandbox(events: Event[]): Result {
  const sn = events.find((e) => e.dir === "out" && e.msg?.method === "session/new");
  const sb = sn?.msg.params?._meta?.claudeCode?.options?.sandbox;
  const flags = { enabled: true, failIfUnavailable: true, autoAllowBashIfSandboxed: true, allowUnsandboxedCommands: false };
  const flagsOk = Object.entries(flags).every(([k, v]) => sb?.[k] === v);
  const domainsOk = JSON.stringify(sb?.network?.allowedDomains) === JSON.stringify(DEFAULT_DOMAINS);
  if (!flagsOk || !domainsOk) return fail("sandbox-option-mismatch", JSON.stringify(sb ?? null));
  const options = sn?.msg.params?._meta?.claudeCode?.options;
  if (JSON.stringify(options?.settings) !== JSON.stringify({ permissions: { ask: ["WebFetch"] }, disableClaudeAiConnectors: true })) {
    return fail("settings-option-mismatch", JSON.stringify(options?.settings ?? null));
  }
  if (JSON.stringify(options?.tools) !== JSON.stringify(WORKER_TOOLS)) {
    return fail("tools-option-mismatch", JSON.stringify(options?.tools ?? null));
  }
  return pass(`sandbox on, allowedDomains ${JSON.stringify(DEFAULT_DOMAINS)}, WebFetch ask rule, connectors off, tools ${WORKER_TOOLS.join(",")}`);
}

const FORBIDDEN_TOOLS = ["RemoteTrigger", "CronCreate", "ScheduleWakeup", "Agent", "SendMessage"];

// The events carry the tools a worker called (_meta.claudeCode.toolName) and the tools ToolSearch loaded
// (tool_reference blocks), not the tool list the model was given.
export function checkWorkerTools(events: Event[]): Result {
  const seen = new Set<string>();
  for (const e of events) {
    if (e.dir !== "in" || e.msg?.method !== "session/update") continue;
    const text = JSON.stringify(e.msg.params?.update ?? null);
    for (const m of text.matchAll(/"(?:toolName|tool_name)":"([^"]+)"/g)) seen.add(m[1]);
  }
  const outside = [...seen].filter((n) => FORBIDDEN_TOOLS.includes(n) || n.startsWith("mcp__"));
  if (outside.length > 0) return fail("forbidden-tool-seen", outside.join(","));
  return pass(`tools seen: ${[...seen].sort().join(",")}`);
}

export function checkNoExecutePermission(events: Event[]): Result {
  const count = requestsOf(events).filter((r) => r.toolCall.kind === "execute").length;
  if (count > 0) return fail("execute-permission-request", `${count} request(s) of kind execute`);
  return pass("0 permission requests of kind execute");
}
