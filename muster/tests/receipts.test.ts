import { describe, expect, test } from "bun:test";
import {
  checkAllowlistedProbe,
  checkBlockedProbe,
  checkBlockedWrite,
  checkFetch,
  parseEvents,
  type Event,
} from "../e2e/receipts";

// Event shapes follow the prototype's events.jsonl (lines 29-33 and 93-98, and the
// session/request_permission envelope of line 97): a tool_call with empty rawInput,
// then tool_call_update lines that carry the command and the final status.
const SESSION = "5427af85-f821-4c72-bdce-031f00ad5204";
const ONCE_OPTIONS = [
  { optionId: "allow-once", name: "Yes", kind: "allow_once" },
  { optionId: "reject", name: "No", kind: "reject_once" },
];

const bashStart = (id: string): Event => ({
  dir: "in",
  msg: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: SESSION,
      update: {
        _meta: { claudeCode: { toolName: "Bash" } },
        toolCallId: id,
        sessionUpdate: "tool_call",
        name: "Bash",
        rawInput: {},
        status: "pending",
        title: "Terminal",
        kind: "execute",
        content: [],
      },
    },
  },
});

const bashUpdate = (id: string, fields: object): Event => ({
  dir: "in",
  msg: {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: SESSION,
      update: { _meta: { claudeCode: { toolName: "Bash" } }, toolCallId: id, sessionUpdate: "tool_call_update", ...fields },
    },
  },
});

const bashCommand = (id: string, command: string): Event[] => [
  bashStart(id),
  bashUpdate(id, { rawInput: { command }, title: command }),
];

const bashFinished = (id: string, status: string, rawOutput: string): Event => bashUpdate(id, { status, rawOutput });

const permission = (id: number, toolCall: object, options: object[]): Event => ({
  dir: "in",
  msg: {
    jsonrpc: "2.0",
    id,
    method: "session/request_permission",
    params: { toolCall: { status: "pending", ...toolCall }, options, sessionId: SESSION },
  },
});

const replySelected = (id: number, optionId: string): Event => ({
  dir: "out",
  msg: { jsonrpc: "2.0", id, result: { outcome: { outcome: "selected", optionId } } },
});

const clientDecision = (msg: object): Event => ({ dir: "client-decision", msg });

const blockedWriteStream = (path: string): Event[] => [
  ...bashCommand("tc-write", `echo x > ${path}`),
  bashFinished("tc-write", "failed", `Exit code 1\n/bin/bash: ${path}: Operation not permitted`),
];

const curlStream = (host: string, status: string, rawOutput: string): Event[] => [
  ...bashCommand("tc-curl", `curl -sS -m 10 -o /dev/null -w %{http_code} https://${host}/`),
  bashFinished("tc-curl", status, rawOutput),
];

const blockedCurl = (host: string) =>
  curlStream(host, "failed", "Exit code 28\ncurl: (28) Connection timed out after 10002 milliseconds\n000");

const fetchRequest = (id: number, url: string): Event =>
  permission(
    id,
    { toolCallId: `tc-fetch-${id}`, name: "WebFetch", rawInput: { url }, title: url, kind: "fetch", content: [], locations: [] },
    ONCE_OPTIONS,
  );

const fetchStream = (url: string, optionId: string, decision: object): Event[] => [
  fetchRequest(3, url),
  clientDecision(decision),
  replySelected(3, optionId),
];

describe("bash and network receipts", () => {
  const PLAIN = "/base/plain-out/plain.txt";

  test("a blocked write that was attempted, failed and left no file passes", () => {
    const result = checkBlockedWrite({ events: blockedWriteStream(PLAIN), needle: PLAIN, targetExists: false });
    expect(result.ok).toBe(true);
  });

  test("the same blocked write with the target file present fails as file-exists", () => {
    const result = checkBlockedWrite({ events: blockedWriteStream(PLAIN), needle: PLAIN, targetExists: true });
    expect(result).toMatchObject({ ok: false, failure: "file-exists" });
  });

  test("a stream where the blocked-write command never appears fails as not-attempted", () => {
    const result = checkBlockedWrite({ events: blockedCurl("example.com"), needle: PLAIN, targetExists: false });
    expect(result).toMatchObject({ ok: false, failure: "not-attempted" });
  });

  test("an allowlisted probe with a QUESTION naming its host fails as question-names-host", () => {
    const events = curlStream("registry.npmjs.org", "completed", "200");
    const questions = [{ kind: "other", title: "registry.npmjs.org", rawInput: { host: "registry.npmjs.org" } }];
    const result = checkAllowlistedProbe({ events, needle: "registry.npmjs.org", host: "registry.npmjs.org", questions });
    expect(result).toMatchObject({ ok: false, failure: "question-names-host" });
  });

  test("an allowlisted probe with no permission request and no QUESTION passes", () => {
    const events = curlStream("registry.npmjs.org", "completed", "200");
    const result = checkAllowlistedProbe({ events, needle: "registry.npmjs.org", host: "registry.npmjs.org", questions: [] });
    expect(result.ok).toBe(true);
  });

  test("a non-allowlisted probe whose output is 200 fails as probe-not-blocked", () => {
    const events = curlStream("example.com", "completed", "200");
    const result = checkBlockedProbe({ events, needle: "example.com", host: "example.com", questions: [] });
    expect(result).toMatchObject({ ok: false, failure: "probe-not-blocked" });
  });

  test("a non-allowlisted probe that failed with 000 and no QUESTION passes", () => {
    const result = checkBlockedProbe({ events: blockedCurl("example.com"), needle: "example.com", host: "example.com", questions: [] });
    expect(result.ok).toBe(true);
  });
});

describe("fetch receipts", () => {
  test("an allowlisted fetch answered allow_once and a non-allowlisted fetch answered reject_once both pass", () => {
    const allowed = fetchStream("https://registry.npmjs.org/", "allow-once", {
      decision: "allow",
      by: "policy",
      host: "registry.npmjs.org",
    });
    const rejected = fetchStream("https://example.com/", "reject", {
      decision: "deny",
      by: "policy",
      host: "example.com",
    });
    expect(checkFetch({ events: allowed, url: "https://registry.npmjs.org/", expect: "allow", questions: [] }).ok).toBe(true);
    expect(checkFetch({ events: rejected, url: "https://example.com/", expect: "reject", questions: [] }).ok).toBe(true);
  });

  test("a non-allowlisted fetch answered with an allow reply fails as fetch-not-rejected", () => {
    const events = fetchStream("https://example.com/", "allow-once", { decision: "allow", by: "policy", host: "example.com" });
    const result = checkFetch({ events, url: "https://example.com/", expect: "reject", questions: [] });
    expect(result).toMatchObject({ ok: false, failure: "fetch-not-rejected" });
  });

  test("a QUESTION file for a fetch fails as question-for-fetch", () => {
    const events = fetchStream("https://registry.npmjs.org/", "allow-once", {
      decision: "allow",
      by: "policy",
      host: "registry.npmjs.org",
    });
    const questions = [{ kind: "fetch", title: "https://registry.npmjs.org/" }];
    const result = checkFetch({ events, url: "https://registry.npmjs.org/", expect: "allow", questions });
    expect(result).toMatchObject({ ok: false, failure: "question-for-fetch" });
  });

  test("a stream with no fetch request at all fails as no-fetch-request", () => {
    const events = curlStream("example.com", "failed", "000");
    const result = checkFetch({ events, url: "https://example.com/", expect: "reject", questions: [] });
    expect(result).toMatchObject({ ok: false, failure: "no-fetch-request" });
  });
});

describe("parseEvents", () => {
  test("reads one JSON object per non-empty line", () => {
    const text = [JSON.stringify(bashStart("tc-x")), "", JSON.stringify(clientDecision({ decision: "allow" }))].join("\n");
    expect(parseEvents(text)).toHaveLength(2);
  });
});
