import { describe, expect, test } from "bun:test";
import {
  checkAllowlistedProbe,
  checkBlockedProbe,
  checkBlockedWrite,
  checkCompleted,
  checkExecuteAllowedOnce,
  checkFetch,
  checkOnlyBranchRefChanged,
  checkRefProtected,
  checkSessionSandbox,
  checkWorkerTools,
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

describe("execute permission receipt", () => {
  const executeRequest = (id: number): Event =>
    permission(id, { toolCallId: `tc-exec-${id}`, name: "Bash", rawInput: { command: "echo $(date)" }, title: "Terminal", kind: "execute", content: [], locations: [] }, ONCE_OPTIONS);

  test("an execute request answered allow_once by policy with no QUESTION passes", () => {
    const events = [executeRequest(5), clientDecision({ decision: "allow", by: "policy" }), replySelected(5, "allow-once")];
    expect(checkExecuteAllowedOnce({ events, questions: [] }).ok).toBe(true);
  });

  test("a stream with no execute request passes", () => {
    expect(checkExecuteAllowedOnce({ events: blockedCurl("example.com"), questions: [] }).ok).toBe(true);
  });

  test("an execute request answered reject fails as execute-not-allowed-once", () => {
    const events = [executeRequest(5), clientDecision({ decision: "deny", by: "policy" }), replySelected(5, "reject")];
    expect(checkExecuteAllowedOnce({ events, questions: [] })).toMatchObject({ ok: false, failure: "execute-not-allowed-once" });
  });

  test("an execute request that raised a QUESTION fails as question-for-execute", () => {
    const events = [executeRequest(5), clientDecision({ decision: "allow", by: "policy" }), replySelected(5, "allow-once")];
    const questions = [{ kind: "execute", title: "Terminal" }];
    expect(checkExecuteAllowedOnce({ events, questions })).toMatchObject({ ok: false, failure: "question-for-execute" });
  });
});

describe("parseEvents", () => {
  test("reads one JSON object per non-empty line", () => {
    const text = [JSON.stringify(bashStart("tc-x")), "", JSON.stringify(clientDecision({ decision: "allow" }))].join("\n");
    expect(parseEvents(text)).toHaveLength(2);
  });
});

const toolCall = (toolName: string): Event => ({
  dir: "in",
  msg: { method: "session/update", params: { update: { sessionUpdate: "tool_call", _meta: { claudeCode: { toolName } } } } },
});

const toolReference = (toolName: string): Event => ({
  dir: "in",
  msg: {
    method: "session/update",
    params: { update: { sessionUpdate: "tool_call_update", content: [{ type: "tool_reference", tool_name: toolName }] } },
  },
});

const toolSearch = (query: string): Event => ({
  dir: "in",
  msg: {
    method: "session/update",
    params: {
      update: { sessionUpdate: "tool_call_update", toolCallId: "tc-ts", _meta: { claudeCode: { toolName: "ToolSearch" } }, rawInput: { query } },
    },
  },
});

const STEP_13 = toolSearch("select:RemoteTrigger,CronCreate,ScheduleWakeup,SendMessage");

describe("worker tool receipt", () => {
  test("calls to allowlisted tools and the step 13 ToolSearch call pass", () => {
    expect(checkWorkerTools([toolCall("Bash"), STEP_13, toolReference("WebFetch")]).ok).toBe(true);
  });

  test.each(["RemoteTrigger", "CronCreate", "ScheduleWakeup", "Agent", "SendMessage", "TodoWrite", "NotebookEdit", "mcp__claude_ai_Gmail__send_message"])(
    "a called %s fails as tool-outside-allowlist",
    (name) => {
      const r = checkWorkerTools([toolCall("Bash"), STEP_13, toolCall(name)]);
      expect(r).toMatchObject({ ok: false, failure: "tool-outside-allowlist" });
    },
  );

  test("a tool outside the allowlist loaded through ToolSearch fails as tool-outside-allowlist", () => {
    expect(checkWorkerTools([STEP_13, toolReference("RemoteTrigger")])).toMatchObject({ ok: false, failure: "tool-outside-allowlist" });
  });

  test("a stream with no ToolSearch call at all fails as toolsearch-not-called", () => {
    expect(checkWorkerTools([toolCall("Bash"), toolCall("Write")])).toMatchObject({ ok: false, failure: "toolsearch-not-called" });
  });

  test("a ToolSearch call that only loads WebFetch does not count as step 13", () => {
    expect(checkWorkerTools([toolCall("Bash"), toolSearch("select:WebFetch")])).toMatchObject({ ok: false, failure: "toolsearch-not-called" });
  });
});

describe("protected ref receipt", () => {
  const NEEDLE = "update-ref refs/heads/main";
  const command = "git -C /base/repo update-ref refs/heads/main HEAD";
  const refused = [
    ...bashCommand("tc-ref", command),
    bashFinished("tc-ref", "failed", "Exit code 128\nfatal: Unable to create '/base/repo/.git/refs/heads/main.lock': Operation not permitted"),
  ];

  test("an attempted update-ref that failed with the ref unchanged passes", () => {
    expect(checkRefProtected({ events: refused, needle: NEEDLE, before: "abc", after: "abc" }).ok).toBe(true);
  });

  test("a stream where the update-ref command never appears fails as not-attempted", () => {
    const result = checkRefProtected({ events: blockedCurl("example.com"), needle: NEEDLE, before: "abc", after: "abc" });
    expect(result).toMatchObject({ ok: false, failure: "not-attempted" });
  });

  test("an update-ref that completed fails as not-blocked even when the ref did not change", () => {
    const events = [...bashCommand("tc-ref", command), bashFinished("tc-ref", "completed", "")];
    expect(checkRefProtected({ events, needle: NEEDLE, before: "abc", after: "abc" })).toMatchObject({ ok: false, failure: "not-blocked" });
  });

  test("a failed update-ref with a moved ref fails as ref-moved", () => {
    expect(checkRefProtected({ events: refused, needle: NEEDLE, before: "abc", after: "def" })).toMatchObject({ ok: false, failure: "ref-moved" });
  });
});

describe("package install receipt", () => {
  const install = "npm install --prefix scratch left-pad";

  test("a left-pad install that completed passes", () => {
    const events = [...bashCommand("tc-npm", install), bashFinished("tc-npm", "completed", "added 1 package")];
    expect(checkCompleted({ events, needle: "left-pad" }).ok).toBe(true);
  });

  test("a left-pad install that failed fails as not-completed", () => {
    const events = [...bashCommand("tc-npm", install), bashFinished("tc-npm", "failed", "npm error EPERM")];
    expect(checkCompleted({ events, needle: "left-pad" })).toMatchObject({ ok: false, failure: "not-completed" });
  });

  test("a stream without the install fails as not-attempted", () => {
    expect(checkCompleted({ events: blockedCurl("example.com"), needle: "left-pad" })).toMatchObject({ ok: false, failure: "not-attempted" });
  });
});

describe("session/new receipt", () => {
  const sessionNew = (options: Record<string, unknown>): Event => ({
    dir: "out",
    msg: { method: "session/new", params: { _meta: { claudeCode: { options } } } },
  });
  const good = {
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      network: { allowedDomains: ["registry.npmjs.org"] },
    },
    settings: { permissions: { ask: ["WebFetch"] }, disableClaudeAiConnectors: true },
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch", "WebSearch", "ToolSearch"],
  };

  test("both new fields present pass", () => {
    expect(checkSessionSandbox([sessionNew(good)]).ok).toBe(true);
  });

  test("a missing tools field fails as tools-option-mismatch", () => {
    const { tools: _, ...rest } = good;
    expect(checkSessionSandbox([sessionNew(rest)])).toMatchObject({ ok: false, failure: "tools-option-mismatch" });
  });

  test("connectors left on fail as settings-option-mismatch", () => {
    const r = checkSessionSandbox([sessionNew({ ...good, settings: { permissions: { ask: ["WebFetch"] } } })]);
    expect(r).toMatchObject({ ok: false, failure: "settings-option-mismatch" });
  });
});

describe("source repo refs receipt", () => {
  const main = "aaa commit\trefs/heads/main";
  const own = (sha: string) => `${sha} commit\trefs/heads/muster/x`;

  test("only the fetched branch appearing passes", () => {
    expect(checkOnlyBranchRefChanged({ before: main, after: `${main}\n${own("bbb")}`, branch: "muster/x" }).ok).toBe(true);
  });

  test("a leaked tag fails as ref-leaked", () => {
    const after = `${main}\n${own("bbb")}\nccc commit\trefs/tags/release`;
    expect(checkOnlyBranchRefChanged({ before: main, after, branch: "muster/x" })).toMatchObject({ ok: false, failure: "ref-leaked" });
  });

  test("a moved main fails as ref-leaked", () => {
    const after = `ddd commit\trefs/heads/main\n${own("bbb")}`;
    expect(checkOnlyBranchRefChanged({ before: main, after, branch: "muster/x" })).toMatchObject({ ok: false, failure: "ref-leaked" });
  });

  test("no fetched branch fails as branch-not-fetched", () => {
    expect(checkOnlyBranchRefChanged({ before: main, after: main, branch: "muster/x" })).toMatchObject({ ok: false, failure: "branch-not-fetched" });
  });
});
