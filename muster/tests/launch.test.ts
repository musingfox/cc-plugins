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

  test("T2: API key variables are dropped, PATH kept, advisor tool disabled", () => {
    const { env } = buildAgentLaunch({
      ANTHROPIC_API_KEY: "sk-leak",
      ANTHROPIC_AUTH_TOKEN: "tok-leak",
      PATH: "/bin",
    });
    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
    expect(Object.values(env).some((v) => v.includes("leak"))).toBe(false);
    expect(env.PATH).toBe("/bin");
    expect(env.CLAUDE_CODE_DISABLE_ADVISOR_TOOL).toBe("1");
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
