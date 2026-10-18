import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRepo } from "./support/repo";

const CLI = join(import.meta.dir, "..", "src", "muster.ts");
const FAKE_AGENT = join(import.meta.dir, "support", "fake-agent.ts");
const PERMISSION_TURN = join(import.meta.dir, "support", "scenarios", "permission-turn.ts");

const VERBS = ["run", "status", "watch", "answer", "followup", "stop"];

let home: string;
let repo: string;
let outside: string;
let env: Record<string, string>;
let hook: string;
const live: { kill: () => void }[] = [];

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "muster-dispatch-"));
  repo = makeRepo();
  outside = join(home, "outside.txt");
  hook = join(home, "turn-hook.ts");
  // Writes DONE to the report file once the permission is answered with an option (allow or deny),
  // so the fake agent "writes DONE" whether or not the client allowed the outside write. A
  // cancelled permission (stop) does not finish the turn.
  writeFileSync(
    hook,
    `import * as base from ${JSON.stringify(PERMISSION_TURN)};
import { writeFileSync } from "node:fs";
export const setup = base.setup;
let reportPath;
export function handle(msg, io) {
  if (msg.method === "session/prompt") {
    reportPath = /^Report file: (.+)$/m.exec(msg.params?.prompt?.[0]?.text ?? "")?.[1];
  }
  if (msg.id === "perm-1" && msg.method === undefined && reportPath && msg.result?.outcome?.outcome === "selected") {
    writeFileSync(reportPath, "DONE\\n");
  }
  return base.handle(msg, io);
}
`,
  );
  env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    MUSTER_HOME: join(home, "m"),
    MUSTER_AGENT_CMD: JSON.stringify(["bun", FAKE_AGENT]),
    MUSTER_KILL_GRACE_MS: "300",
    MUSTER_POLL_MS: "50",
    FAKE_AGENT_SCRIPT: hook,
  };
});

afterEach(() => {
  for (const p of live.splice(0)) p.kill();
  rmSync(home, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

afterAll(() => {
  for (const p of live.splice(0)) p.kill();
});

function muster(args: string[], extra: Record<string, string> = {}) {
  const p = Bun.spawnSync(["bun", CLI, ...args], { env: { ...env, ...extra }, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
}

function scenario(extra: Record<string, unknown>): string {
  return JSON.stringify({
    results: {
      initialize: { agentInfo: { name: "claude-agent-acp", version: "0.93.0" } },
      "session/new": {
        sessionId: "s1",
        configOptions: [
          {
            id: "model",
            category: "model",
            currentValue: "haiku",
            options: [{ value: "haiku" }, { value: "sonnet" }],
          },
          { id: "mode", category: "mode", currentValue: "default", options: [{ value: "default" }] },
        ],
      },
    },
    permission: {
      toolCall: {
        kind: "edit",
        title: "write outside",
        locations: [{ path: outside }],
        rawInput: { file_path: outside },
      },
    },
    writeOnAllow: { path: outside, content: "written\n" },
    ...extra,
  });
}

async function waitFor(check: () => boolean, ms = 15000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 20));
  }
}

// Starts `muster run` in the background; stdout goes to a file so the test can read RUNDIR=.
function startRun(name: string, model = "haiku", scen = scenario({})) {
  const outFile = join(home, `${name}.out`);
  const proc = Bun.spawn(
    ["bun", CLI, "run", "--name", name, "--model", model, "--repo", repo, "--ticket", "write the file"],
    {
      env: { ...env, FAKE_AGENT_SCENARIO: scen },
      stdout: Bun.file(outFile),
      stderr: "pipe",
    },
  );
  live.push(proc);
  const runDir = () => {
    const text = existsSync(outFile) ? readFileSync(outFile, "utf8") : "";
    const line = text.split("\n")[0];
    return line.startsWith("RUNDIR=") ? line.slice("RUNDIR=".length) : undefined;
  };
  return { proc, outFile, runDir };
}

describe("VerbDispatch", () => {
  test("T1: --help lists exactly the six verbs, one per line", () => {
    const r = muster(["--help"]);
    expect(r.out.split("\n").filter((l) => l !== "")).toEqual(VERBS);
  });

  test("T2: an unknown verb exits 2 and prints usage on stderr", () => {
    const r = muster(["frobnicate"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("usage");
    expect(r.out).toBe("");
  });

  test("T3: run -> watch sees question -> allow -> watch sees done; the outside file appears only after allow", async () => {
    const name = "d3";
    const run = startRun(name);
    await waitFor(() => run.runDir() !== undefined);
    const runDir = run.runDir()!;
    expect(runDir.startsWith("/")).toBe(true);
    expect(runDir).toBe(join(env.MUSTER_HOME, "runs", name));

    await waitFor(() => existsSync(join(runDir, "meta.json")));
    const watchQuestion = muster(["watch", name]);
    expect(watchQuestion.code).toBe(0);
    expect(watchQuestion.out).toContain("state=question");
    expect(existsSync(outside)).toBe(false);

    const answered = muster(["answer", name, "allow"]);
    expect(answered.code).toBe(0);

    const watchDone = muster(["watch", name]);
    expect(watchDone.out).toContain("state=done");
    expect(muster(["status", name]).out).toContain("state=done");
    expect(readFileSync(outside, "utf8")).toBe("written\n");

    muster(["stop", name]);
    expect(await run.proc.exited).toBe(0);
  });

  test("T4: answer deny leaves the outside file absent and the run still ends done", async () => {
    const name = "d4";
    const run = startRun(name);
    await waitFor(() => run.runDir() !== undefined);
    await waitFor(() => existsSync(join(run.runDir()!, "meta.json")));
    expect(muster(["watch", name]).out).toContain("state=question");

    expect(muster(["answer", name, "deny"]).code).toBe(0);
    expect(muster(["watch", name]).out).toContain("state=done");
    expect(existsSync(outside)).toBe(false);
    expect(muster(["status", name]).out).toContain("state=done");

    muster(["stop", name]);
    expect(await run.proc.exited).toBe(0);
  });

  test("T5: stop during a pending question exits the run 0 and status shows blocked with the stop reason", async () => {
    const name = "d5";
    const run = startRun(name);
    await waitFor(() => run.runDir() !== undefined);
    await waitFor(() => existsSync(join(run.runDir()!, "meta.json")));
    expect(muster(["watch", name]).out).toContain("state=question");

    expect(muster(["stop", name]).code).toBe(0);
    expect(await run.proc.exited).toBe(0);
    const status = muster(["status", name]).out;
    expect(status).toContain("state=blocked");
    expect(status).toContain("stopped");
    expect(existsSync(outside)).toBe(false);
  });

  test("R3: the agent environment omits the API keys muster was started with, and no run file holds them", () => {
    const name = "d7";
    const envDump = join(home, "agent-env.json");
    const agentCmd = ["bun", "-e", `require("node:fs").writeFileSync(process.env.ENV_DUMP, JSON.stringify(process.env))`];
    Bun.spawnSync(["bun", CLI, "run", "--name", name, "--model", "haiku", "--repo", repo, "--ticket", "write the file"], {
      env: {
        ...env,
        MUSTER_AGENT_CMD: JSON.stringify(agentCmd),
        ENV_DUMP: envDump,
        ANTHROPIC_API_KEY: "sk-test",
        ANTHROPIC_AUTH_TOKEN: "tok-test",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30000,
    });
    const dump = readFileSync(envDump, "utf8");
    expect(dump).not.toContain("ANTHROPIC_API_KEY");
    expect(dump).not.toContain("ANTHROPIC_AUTH_TOKEN");

    const runDir = join(env.MUSTER_HOME, "runs", name);
    const files = readdirSync(runDir, { recursive: true }).map((f) => join(runDir, String(f)));
    for (const f of files.filter((f) => statSync(f).isFile())) {
      const text = readFileSync(f, "utf8");
      expect(text).not.toContain("sk-test");
      expect(text).not.toContain("tok-test");
    }
  });

  test("T6: run with a model the adapter does not offer exits 1, status is blocked, and no prompt was sent", async () => {
    const name = "d6";
    const r = Bun.spawnSync(
      ["bun", CLI, "run", "--name", name, "--model", "nope", "--repo", repo, "--ticket", "write the file"],
      { env: { ...env, FAKE_AGENT_SCENARIO: scenario({}) }, stdout: "pipe", stderr: "pipe" },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stdout.toString().split("\n")[0]).toBe(`RUNDIR=${join(env.MUSTER_HOME, "runs", name)}`);
    expect(muster(["status", name]).out).toContain("state=blocked");
    const eventsPath = join(env.MUSTER_HOME, "runs", name, "events.jsonl");
    const events = existsSync(eventsPath) ? readFileSync(eventsPath, "utf8") : "";
    expect(events).not.toContain("session/prompt");
  });
});
