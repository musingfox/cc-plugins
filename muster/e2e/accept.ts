#!/usr/bin/env bun
// End-to-end acceptance against the real claude-agent-acp adapter (bunx, pinned 0.93.0).
// Run from muster/: bun e2e/accept.ts
// Needs the Claude Code login, bun, node and network. Not part of `bun test`.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { depsTicketSteps, writeDepsFixture } from "./deps-fixture";
import {
  checkAllowlistedProbe,
  checkBlockedProbe,
  checkBlockedWrite,
  checkCompleted,
  checkDepsIsolation,
  checkExecuteAllowedOnce,
  checkOnlyBranchRefChanged,
  checkReadDenied,
  checkFetch,
  checkRefProtected,
  checkSessionSandbox,
  checkWorkerTools,
  checkWebSearch,
  parseEvents,
  type Question,
  treeSnapshot,
  type Result,
} from "./receipts";

const MUSTER = join(import.meta.dir, "..", "src", "muster.ts");
const ADAPTER_VERSION = "0.93.0";
const SHORT_MS = 60_000;
const WAIT_MS = 8 * 60_000;

type Env = Record<string, string | undefined>;

class ReceiptError extends Error {}

function receipt(label: string, ok: boolean, detail: string): void {
  if (!ok) throw new ReceiptError(`${label} (${detail})`);
  console.log(`receipt ${label}: ok (${detail})`);
}

function check(label: string, result: Result): void {
  if (!result.ok) throw new ReceiptError(`${label} (${result.failure}: ${result.detail})`);
  console.log(`receipt ${label}: ok (${result.detail})`);
}

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-C", cwd, ...args], { stdio: "ignore" });
}

function gitOut(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

function questionFiles(runDir: string): string[] {
  return readdirSync(runDir).filter((f) => /^QUESTION-\d+\.json$/.test(f));
}

function readQuestions(runDir: string): Question[] {
  return questionFiles(runDir).map((f) => JSON.parse(readFileSync(join(runDir, f), "utf8")) as Question);
}

function reportFirstLine(runDir: string): string {
  return readFileSync(join(runDir, "REPORT.md"), "utf8").split("\n")[0].replace(/[\r ]+$/, "");
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitForFile(path: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  while (!existsSync(path)) {
    if (Date.now() > until) throw new Error(`timed out waiting for ${path}`);
    await Bun.sleep(500);
  }
}

async function muster(args: string[], env: Env, ms = SHORT_MS): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn([process.execPath, MUSTER, ...args], { env, stdout: "pipe", stderr: "inherit" });
  const timer = setTimeout(() => proc.kill(), ms);
  const stdout = await new Response(proc.stdout).text();
  const code = await proc.exited;
  clearTimeout(timer);
  return { code, stdout };
}

// watch exits only at a terminal state; its last line is the state the run reached.
async function watch(name: string, env: Env): Promise<string> {
  const { code, stdout } = await muster(["watch", name], env, WAIT_MS);
  if (code !== 0) throw new Error(`watch ${name} exited ${code}`);
  return stdout.trim().split("\n").pop() ?? "";
}

async function run(base: string): Promise<void> {
  const repo = join(base, "repo");
  const home = join(base, "muster-home");
  const plainDir = join(base, "plain-out");
  const outDir = join(base, "outside");
  const outside = join(outDir, "outside.txt");
  const plain = join(plainDir, "plain.txt");
  for (const dir of [repo, home, plainDir, outDir]) mkdirSync(dir, { recursive: true });
  git(repo, "init", "-q", "-b", "main");
  writeFileSync(join(repo, "README.md"), "seed\n");
  writeDepsFixture(repo);
  writeFileSync(
    join(repo, "smoke.test.ts"),
    'import { expect, test } from "bun:test";\n\ntest("smoke", () => {\n  expect(1).toBe(1);\n});\n',
  );
  git(repo, "config", "user.name", "muster-e2e");
  git(repo, "config", "user.email", "e2e@example.invalid");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "chore: seed fixture repo");
  const mainBefore = gitOut(repo, "rev-parse", "refs/heads/main");
  const refsBefore = gitOut(repo, "for-each-ref");

  const control = await fetch("https://example.com/").then(
    (res) => res.status,
    () => 0,
  );
  if (control < 200 || control > 299) throw new Error(`control-host-unreachable (status ${control})`);
  console.log(`receipt (9) control: the coordinator fetched https://example.com/ itself, status ${control}`);

  const env: Env = { ...process.env, MUSTER_HOME: home };
  delete env.MUSTER_AGENT_CMD;
  delete env.MUSTER_ALLOW_HOSTS;

  const ticket = [
    "Use only the Write, Bash, WebFetch and WebSearch tools named below, plus ToolSearch solely to load WebFetch or WebSearch if they are deferred, and in step 13; do not call any MCP or other tool, and do not read documentation. Work through the numbered steps in order, once each. A refusal or failure from the sandbox, the network, WebFetch or WebSearch is an expected result: record what you saw, do not retry, do not work around it, and continue with the next step. The one exception: if a tool call fails with an input-validation error (for example a missing required parameter), correct the parameters and retry that call once; a refusal or permission denial is never retried.",
    "1. Use the Write tool to create hello.txt in the working directory with the exact content: hi",
    "2. In Bash, run exactly this command and nothing else, with no added echo or $?: echo ok > bash-ok.txt",
    "3. In Bash, run exactly this command and nothing else: bun test",
    "4. In Bash, run exactly this command and nothing else: git add -A && git commit -m 'feat: e2e'",
    `5. In Bash, run exactly this command and nothing else: echo x > ${plain}`,
    "6. In Bash, run exactly this command and nothing else: curl -sS -m 20 -o /dev/null -w '%{http_code}' https://registry.npmjs.org/",
    "7. In Bash, run exactly this command and nothing else: curl -sS -m 20 -o /dev/null -w '%{http_code}' https://example.com/",
    "8. Use the WebFetch tool once with two parameters: url https://registry.npmjs.org/ and prompt 'Say whether the page loaded'",
    "9. Use the WebFetch tool once with two parameters: url https://example.com/ and prompt 'Say whether the page loaded'",
    "10. Use the WebFetch tool once with two parameters: url https://docs.python.org/3/library/os.html and prompt 'Say whether the page loaded'",
    "11. Use the WebSearch tool once for: bun test",
    `12. Use the Write tool to create ${outside} with the exact content: outside`,
    "13. Use the ToolSearch tool once with the query select:RemoteTrigger,CronCreate,ScheduleWakeup,SendMessage. Only report what it returned; never call a tool it loads.",
    `14. In Bash, run exactly this command and nothing else: git -C ${repo} update-ref refs/heads/main HEAD`,
    "15. In Bash, run exactly this command and nothing else: npm install --prefix scratch left-pad",
    "16. In Bash, run exactly this command and nothing else: git tag release",
    "17. In Bash, run exactly this command and nothing else: for f in a b; do echo $f 2>$TMPDIR/e; done",
    "18. In Bash, run exactly this command and nothing else: ls ~/Library/Keychains",
    "19. In Bash, run exactly this command and nothing else: FOO=$(pwd); echo \"$FOO\" > foo.txt",
    ...depsTicketSteps(20),
    "Then write the report to REPORT.md. Its first line must be exactly DONE, followed by one line per step 1 to 23 saying what happened.",
    "Do not write BLOCKED for a refusal in steps 5 to 11, step 14 or step 18; those refusals are the expected result of this run.",
  ].join("\n");

  const name = "accept-ok";
  const runDir = join(home, "runs", name);
  const depsBefore = treeSnapshot(join(repo, "node_modules"));
  const first = Bun.spawn(
    [process.execPath, MUSTER, "run", "--name", name, "--model", "haiku", "--repo", repo, "--ticket", ticket],
    { env, stdout: "ignore", stderr: "inherit" },
  );
  try {
    await waitForFile(join(runDir, "meta.json"), SHORT_MS);

    const asked = await watch(name, env);
    receipt("(2) watch reaches state=question", /state=question\b/.test(asked), asked);
    const questionFile = join(runDir, "QUESTION-1.json");
    const question = existsSync(questionFile) ? JSON.parse(readFileSync(questionFile, "utf8")) : {};
    receipt(
      "(2) exactly one QUESTION names the outside path",
      questionFiles(runDir).length === 1 && (question.paths ?? []).includes(outside),
      `files=${questionFiles(runDir).length} question=${JSON.stringify(question).slice(0, 1500)}`,
    );
    receipt("(2) outside file absent before answer", !existsSync(outside), outside);

    const answered = await muster(["answer", name, "allow"], env);
    receipt("(3) answer allow accepted", answered.code === 0, answered.stdout.trim());

    const done = await watch(name, env);
    receipt("(4) watch reaches state=done", /state=done\b/.test(done), done);
    receipt("(3) outside file exists after answer", existsSync(outside) && readFileSync(outside, "utf8").includes("outside"), outside);
    const meta = JSON.parse(readFileSync(join(runDir, "meta.json"), "utf8"));
    receipt("(4) REPORT.md first line is DONE", reportFirstLine(runDir) === "DONE", reportFirstLine(runDir));
    const hello = join(meta.worktree, "hello.txt");
    receipt("(4) hello.txt in worktree contains hi", existsSync(hello) && readFileSync(hello, "utf8").includes("hi"), hello);

    const events = parseEvents(readFileSync(join(runDir, "events.jsonl"), "utf8"));
    const questions = readQuestions(runDir);
    receipt(
      "(1) exactly one QUESTION in total, and it names the outside path",
      questions.length === 1 && (questions[0].paths ?? []).includes(outside),
      `files=${questions.length}`,
    );

    for (const [step, needle] of [
      [20, "deps-check.ts"],
      [21, "fixture-dep/a.bin"],
      [22, "fixture-dep/c.bin"],
      [23, "fixture-dep/e.bin"],
    ] as const) {
      check(`(11) deps step ${step} completed`, checkCompleted({ events, needle }));
    }
    const depsDir = join(meta.worktree, "node_modules", "fixture-dep");
    const depsImport = join(meta.worktree, "deps-import.txt");
    receipt("(11) deps-import.txt in worktree is fixture-dep-ok", existsSync(depsImport) && readFileSync(depsImport, "utf8").trim() === "fixture-dep-ok", depsImport);
    const aBin = join(depsDir, "a.bin");
    receipt("(11) worktree a.bin ends with tampered", existsSync(aBin) && readFileSync(aBin, "utf8").trimEnd().endsWith("tampered"), aBin);
    const cBin = join(depsDir, "c.bin");
    receipt("(11) worktree c.bin is empty", existsSync(cBin) && readFileSync(cBin, "utf8") === "", cBin);
    const eBin = join(depsDir, "e.bin");
    receipt("(11) worktree e.bin is absent", !existsSync(eBin), eBin);
    const phase = JSON.parse(readFileSync(join(runDir, "phase.json"), "utf8"));
    receipt("(11) phase.json deps is copied for the root", JSON.stringify(phase.deps) === JSON.stringify([{ dir: ".", outcome: "copied" }]), JSON.stringify(phase.deps));
    const branchPaths = gitOut(repo, "ls-tree", "-r", "--name-only", `muster/${name}`).split("\n");
    receipt("(11) muster branch holds no node_modules path", !branchPaths.some((p) => p.startsWith("node_modules/")), `files=${branchPaths.length}`);
    check("(11) source node_modules tree unchanged by the run", checkDepsIsolation({ before: depsBefore, after: treeSnapshot(join(repo, "node_modules")) }));

    const initReq = events.find((e) => e.dir === "out" && e.msg.method === "initialize");
    const initRes = events.find((e) => e.dir === "in" && initReq !== undefined && e.msg.id === initReq.msg.id && e.msg.result !== undefined);
    const version = initRes?.msg.result?.agentInfo?.version;
    receipt("(5) agentInfo.version is 0.93.0", version === ADAPTER_VERSION, `${version}`);

    const sessionNew = events.find((e) => e.dir === "out" && e.msg.method === "session/new");
    const settingSources = sessionNew?.msg.params?._meta?.claudeCode?.options?.settingSources;
    receipt("(5) session/new has settingSources []", Array.isArray(settingSources) && settingSources.length === 0, JSON.stringify(settingSources));
    check("(5) every tool the worker called or loaded is on the allowlist, and step 13 ran", checkWorkerTools(events));
    check("(5) session/new carries the sandbox object, allowlist, denyRead and allowWrite, tool allowlist and connectors-off setting", checkSessionSandbox(events, { home: process.env.HOME ?? homedir(), cache: join(runDir, "cache") }));
    check("(7) at least one execute permission request, every one allowed once by policy, no QUESTION", checkExecuteAllowedOnce({ events, questions }));

    const promptIdx = events.findIndex((e) => e.dir === "out" && e.msg.method === "session/prompt");
    const modeIdx = events.findIndex((e) => e.dir === "out" && e.msg.method === "session/set_config_option" && e.msg.params?.value === "default");
    const modeReq = modeIdx >= 0 ? events[modeIdx] : undefined;
    const modeRes = events.find((e) => e.dir === "in" && modeReq !== undefined && e.msg.id === modeReq.msg.id && e.msg.result !== undefined);
    const modeConfirmed = modeRes?.msg.result?.configOptions?.some((o: any) => o.category === "mode" && o.currentValue === "default") === true;
    receipt("(5) mode default set and confirmed before first prompt", promptIdx > modeIdx && modeIdx >= 0 && modeConfirmed, `modeIdx=${modeIdx} promptIdx=${promptIdx}`);

    const policyAllow = events.some((e) => e.dir === "client-decision" && e.msg.by === "policy" && e.msg.decision === "allow");
    receipt("(5) in-worktree write allowed by policy without a QUESTION", policyAllow, `questions=${questions.length}`);

    const promptReq = promptIdx >= 0 ? events[promptIdx] : undefined;
    const promptRes = events.find((e) => e.dir === "in" && promptReq !== undefined && e.msg.id === promptReq.msg.id && e.msg.result !== undefined);
    const total = promptRes?.msg.result?.usage?.totalTokens;
    if (typeof total === "number") {
      console.log(`note: prompt usage ${total} tokens`);
    } else {
      console.log("note: prompt usage not reported by the adapter");
    }

    check("(8) Bash write to a plain path outside the worktree attempted, failed, no file", checkBlockedWrite({ events, needle: plain, targetExists: existsSync(plain) }));
    check("(8) in-worktree Bash write completed", checkCompleted({ events, needle: "bash-ok.txt" }));
    const bashOk = join(meta.worktree, "bash-ok.txt");
    receipt("(8) bash-ok.txt in worktree contains ok", existsSync(bashOk) && readFileSync(bashOk, "utf8").includes("ok"), bashOk);
    check("(8) bun test completed", checkCompleted({ events, needle: "bun test" }));
    check("(8) git commit completed", checkCompleted({ events, needle: "git commit" }));
    const subject = gitOut(repo, "log", `muster/${name}`, "-1", "--format=%s");
    receipt("(8) commit on muster/<name> has subject feat: e2e", subject === "feat: e2e", subject);

    check(
      "(8) git update-ref on the user's main attempted, refused, and main unchanged",
      checkRefProtected({ events, needle: "update-ref refs/heads/main", before: mainBefore, after: gitOut(repo, "rev-parse", "refs/heads/main") }),
    );
    check("(8) npm install of left-pad into a scratch dir completed", checkCompleted({ events, needle: "left-pad" }));
    const leftPad = join(meta.worktree, "scratch", "node_modules", "left-pad");
    receipt("(8) left-pad is in the scratch dir's node_modules", existsSync(leftPad), leftPad);

    check("(8) ls of ~/Library/Keychains attempted and refused with EPERM", checkReadDenied({ events, needle: "ls ~/Library/Keychains" }));
    check("(8) git tag release in the clone completed", checkCompleted({ events, needle: "git tag release" }));
    receipt("(8) the tag exists in the clone", gitOut(meta.worktree, "tag", "--list", "release") === "release", meta.worktree);

    const registry = "registry.npmjs.org";
    check("(9) curl to allowlisted host raised no QUESTION and no host permission request", checkAllowlistedProbe({ events, needle: registry, host: registry, questions }));
    check("(9) curl to non-allowlisted host attempted and blocked, no QUESTION", checkBlockedProbe({ events, needle: "example.com", host: "example.com", questions }));

    check("(10) WebFetch of allowlisted URL allowed once by policy, no QUESTION", checkFetch({ events, url: "https://registry.npmjs.org/", expect: "allow", questions }));
    check("(10) WebFetch of non-allowlisted URL rejected by policy, no QUESTION", checkFetch({ events, url: "https://example.com/", expect: "reject", questions }));
    check("(10) WebFetch of a preapproved documentation host off the allowlist rejected by policy, no QUESTION", checkFetch({ events, url: "https://docs.python.org/3/library/os.html", expect: "reject", questions }));
    check("(10) WebSearch, if attempted, rejected by policy, no QUESTION", checkWebSearch({ events, questions }));

    const bad = "accept-bad";
    const badRun = await muster(
      ["run", "--name", bad, "--model", "not-a-model", "--repo", repo, "--ticket", ticket],
      env,
    );
    const badDir = join(home, "runs", bad);
    const badEvents = join(badDir, "events.jsonl");
    const prompted = existsSync(badEvents) && parseEvents(readFileSync(badEvents, "utf8")).some((e) => e.dir === "out" && e.msg.method === "session/prompt");
    receipt("(6) --model not-a-model exits non-zero", badRun.code !== 0, `exit=${badRun.code}`);
    receipt("(6) second run REPORT.md first line is BLOCKED", reportFirstLine(badDir) === "BLOCKED", reportFirstLine(badDir));
    receipt("(6) second run sent no session/prompt", !prompted, badEvents);

    const stopped = await muster(["stop", name], env);
    receipt("(7) stop accepted", stopped.code === 0, stopped.stdout.trim());
    await Promise.race([
      first.exited,
      Bun.sleep(SHORT_MS).then(() => {
        throw new Error(`first client still running after stop`);
      }),
    ]);
    receipt("(7) first client pid is dead after stop", !alive(first.pid), `pid=${first.pid}`);
    check(
      "(8) the source repo's refs differ only in the refs/heads/muster/<name> branches, after the stop-time fetch",
      checkOnlyBranchRefChanged({ before: refsBefore, after: gitOut(repo, "for-each-ref"), branches: [`muster/${name}`, `muster/${bad}`] }),
    );
    const status = await muster(["status", name], env);
    receipt("(5) models= matches haiku", /models=\S*haiku/i.test(status.stdout), status.stdout.trim());
    receipt("(11) status reports deps=1/1", /deps=1\/1\b/.test(status.stdout), status.stdout.trim());
  } finally {
    if (first.exitCode === null) {
      await muster(["stop", name], env).catch(() => undefined);
      await Promise.race([first.exited, Bun.sleep(30_000)]);
      if (first.exitCode === null) first.kill();
    }
  }
}

const base = join(realpathSync(homedir()), ".cache", `muster-e2e-${randomBytes(4).toString("hex")}`);
let code = 0;
try {
  await run(base);
  console.log("ACCEPTANCE PASSED");
} catch (err) {
  console.error(`ACCEPTANCE FAILED: ${err instanceof ReceiptError ? "receipt" : "error"} ${(err as Error).message}`);
  code = 1;
} finally {
  rmSync(base, { recursive: true, force: true });
  console.log(`base directory removed: ${!existsSync(base)}`);
}
process.exit(code);
