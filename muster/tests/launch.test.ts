import { describe, expect, test } from "bun:test";
import {
  ADAPTER_SPEC,
  UsageError,
  buildAgentLaunch,
  isExactPin,
} from "../src/launch";

describe("buildAgentLaunch", () => {
  test("T1: default argv starts the pinned adapter with bunx", () => {
    const { argv } = buildAgentLaunch({ PATH: "/bin" });
    expect(argv).toEqual(["bunx", "@agentclientprotocol/claude-agent-acp@0.93.0"]);
  });

  test("T2: only allowlisted variables reach the agent, plus the advisor switch", () => {
    const kept = {
      PATH: "/bin",
      HOME: "/home/u",
      USER: "u",
      LOGNAME: "u",
      SHELL: "/bin/zsh",
      TMPDIR: "/tmp",
      TERM: "xterm",
      LANG: "en_US.UTF-8",
      TZ: "UTC",
      LC_ALL: "C",
    };
    const dropped = [
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "AWS_SECRET_ACCESS_KEY",
      "CLOUDFLARE_API_TOKEN",
      "OPENAI_API_KEY",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "CLAUDE_CODE_USE_BEDROCK",
      "CLAUDECODE",
      "CLAUDE_CODE_MESSAGING_SOCKET",
      "CLAUDE_CODE_MESSAGING_TOKEN",
      "CLAUDE_CODE_SESSION_ID",
      "MUSTER_AGENT_CMD",
    ];
    const { env } = buildAgentLaunch({
      ...kept,
      ...Object.fromEntries(dropped.map((k) => [k, k === "MUSTER_AGENT_CMD" ? '["bun","x.ts"]' : "leak"])),
    });
    expect(env).toEqual({ ...kept, CLAUDE_CODE_DISABLE_ADVISOR_TOOL: "1" });
  });

  test("T4: MUSTER_AGENT_CMD overrides the default argv", () => {
    const { argv } = buildAgentLaunch({ MUSTER_AGENT_CMD: '["bun","fake.ts"]' });
    expect(argv).toEqual(["bun", "fake.ts"]);
  });

  test("T5: malformed MUSTER_AGENT_CMD throws UsageError", () => {
    for (const bad of ["nope", "[]", "[1]"]) {
      expect(() => buildAgentLaunch({ MUSTER_AGENT_CMD: bad })).toThrow(UsageError);
    }
  });
});

describe("isExactPin", () => {
  test("T3: only an exact x.y.z version counts as pinned", () => {
    expect(isExactPin("x@0.93.0")).toBe(true);
    expect(isExactPin("x@latest")).toBe(false);
    expect(isExactPin("x@^0.93.0")).toBe(false);
    expect(isExactPin("x")).toBe(false);
  });

  test("T3: the default package spec is an exact pin", () => {
    expect(isExactPin(ADAPTER_SPEC)).toBe(true);
  });
});
