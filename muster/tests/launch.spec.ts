import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { openChannel, type Channel } from "../src/channel";
import {
  ADAPTER_SPEC,
  UsageError,
  buildAgentLaunch,
  isExactPin,
} from "../src/launch";

const CACHE = "/runs/a1/cache";
const FAKE = join(import.meta.dir, "support", "fake-agent.ts");
const SCRIPT = join(import.meta.dir, "support", "scenarios", "permission-turn.ts");
const RUNS = join(import.meta.dir, "..", ".test-runs");

describe("buildAgentLaunch", () => {
  test("T1: default argv starts the pinned adapter with bunx", () => {
    const { argv } = buildAgentLaunch({ PATH: "/bin" }, CACHE);
    expect(argv).toEqual(["bunx", "@agentclientprotocol/claude-agent-acp@0.93.0"]);
  });

  test("AgentLaunchEnablesTodoTools T1: the agent environment turns the task-list tools on", () => {
    expect(buildAgentLaunch({ PATH: "/bin" }, "/c").env.CLAUDE_CODE_ENABLE_TODO_TOOLS).toBe("1");
  });

  test("AgentLaunchEnablesTodoTools T2: a parent value of 0 cannot switch the task-list tools off", () => {
    expect(buildAgentLaunch({ CLAUDE_CODE_ENABLE_TODO_TOOLS: "0", PATH: "/bin" }, "/c").env.CLAUDE_CODE_ENABLE_TODO_TOOLS).toBe("1");
  });

  test("AgentLaunchEnablesTodoTools T4: the agent process itself receives the flag", async () => {
    mkdirSync(RUNS, { recursive: true });
    const dir = mkdtempSync(join(RUNS, "launch-"));
    const scenario = JSON.stringify({ echoEnv: true });
    const { argv, env } = buildAgentLaunch({
      PATH: process.env.PATH,
      MUSTER_AGENT_CMD: JSON.stringify(["env", `FAKE_AGENT_SCENARIO=${scenario}`, `FAKE_AGENT_SCRIPT=${SCRIPT}`, process.execPath, FAKE]),
    }, dir);
    const stderrPath = join(dir, "stderr.log");
    const ch: Channel = await openChannel({ argv, env, eventsPath: join(dir, "events.jsonl"), stderrPath });
    try {
      await ch.request("initialize", {});
      const echoed = JSON.parse(readFileSync(stderrPath, "utf8")) as Record<string, string>;
      expect(echoed.CLAUDE_CODE_ENABLE_TODO_TOOLS).toBe("1");
    } finally {
      await ch.close();
      rmSync(dir, { recursive: true, force: true });
    }
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
    const { env } = buildAgentLaunch(
      {
        ...kept,
        ...Object.fromEntries(dropped.map((k) => [k, k === "MUSTER_AGENT_CMD" ? '["bun","x.ts"]' : "leak"])),
        npm_config_cache: "/caller/npm",
        BUN_INSTALL_CACHE_DIR: "/caller/bun",
      },
      CACHE,
    );
    expect(env).toEqual({
      ...kept,
      CLAUDE_CODE_DISABLE_ADVISOR_TOOL: "1",
      CLAUDE_CODE_ENABLE_TODO_TOOLS: "1",
      npm_config_cache: `${CACHE}/npm`,
      BUN_INSTALL_CACHE_DIR: `${CACHE}/bun`,
    });
  });

  test("T4: MUSTER_AGENT_CMD overrides the default argv", () => {
    const { argv } = buildAgentLaunch({ MUSTER_AGENT_CMD: '["bun","fake.ts"]' }, CACHE);
    expect(argv).toEqual(["bun", "fake.ts"]);
  });

  test("T5: malformed MUSTER_AGENT_CMD throws UsageError", () => {
    for (const bad of ["nope", "[]", "[1]"]) {
      expect(() => buildAgentLaunch({ MUSTER_AGENT_CMD: bad }, CACHE)).toThrow(UsageError);
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
