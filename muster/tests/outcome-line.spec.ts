import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "./support/repo";

const CLI = join(import.meta.dir, "..", "src", "muster.ts");
const FAKE_AGENT = join(import.meta.dir, "support", "fake-agent.ts");
const TURN = join(import.meta.dir, "support", "scenarios", "permission-turn.ts");

let home: string;
let repo: string;
let env: Record<string, string>;

const scenario = JSON.stringify({
  replies: ["DONE\nok"],
  results: {
    initialize: { agentInfo: { name: "claude-agent-acp", version: "0.93.0" } },
    "session/new": {
      sessionId: "s1",
      configOptions: [
        { id: "model", category: "model", currentValue: "haiku", options: [{ value: "haiku" }] },
        { id: "mode", category: "mode", currentValue: "default", options: [{ value: "default" }] },
      ],
    },
  },
});

beforeEach(() => {
  // --unfenced runs may live under the temp directory, which a fenced run refuses.
  home = mkdtempSync(join(tmpdir(), "muster-outcome-"));
  repo = mkdtempSync(join(tmpdir(), "muster-outcome-repo-"));
  git(repo, ["init", "-q"]);
  git(repo, ["config", "core.hooksPath", "/dev/null"]);
  writeFileSync(join(repo, "README.md"), "one\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-q", "-m", "first"]);
  env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    MUSTER_HOME: join(home, "m"),
    MUSTER_AGENT_CMD: JSON.stringify(["env", `FAKE_AGENT_SCRIPT=${TURN}`, `FAKE_AGENT_SCENARIO=${scenario}`, "bun", FAKE_AGENT]),
    MUSTER_KILL_GRACE_MS: "300",
    MUSTER_POLL_MS: "50",
  };
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

function muster(args: string[]) {
  const p = Bun.spawnSync(["bun", CLI, ...args], { env, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, lines: p.stdout.toString().trimEnd().split("\n"), err: p.stderr.toString() };
}

describe("TurnPrintsItsOutcome", () => {
  test("O1: run keeps RUNDIR= first and ends with the line status prints", () => {
    const r = muster(["run", "--name", "o1", "--model", "haiku", "--repo", repo, "--unfenced", "--ticket", "write the file"]);
    expect(r.code).toBe(0);
    expect(r.lines[0]).toStartWith("RUNDIR=");
    const status = muster(["status", "o1"]).lines[0];
    expect(status).toStartWith("o1 state=done");
    expect(r.lines.at(-1)).toBe(status);
  });

  test("O2: followup ends with the line status prints", () => {
    muster(["run", "--name", "o2", "--model", "haiku", "--repo", repo, "--unfenced", "--ticket", "write the file"]);
    const r = muster(["followup", "o2", "go on"]);
    expect(r.code).toBe(0);
    const status = muster(["status", "o2"]).lines[0];
    expect(status).toStartWith("o2 state=done");
    expect(r.lines.at(-1)).toBe(status);
  });
});
