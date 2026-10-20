// Shared CDP harness for the e2e scripts (`*.e2e.ts`): a scratch dir, render.sh
// behind a headless `open`, a headless Chromium driven over the DevTools
// protocol, and the failure bookkeeping the scenarios report through. Not a
// test file itself, so `bun test` ignores it.
//
// Env: VIZ_E2E_BROWSER — a Chromium binary (default: Brave on macOS).
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export const VIZ = join(import.meta.dir, "..");
export const BROWSER = process.env.VIZ_E2E_BROWSER ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A scratch dir whose bin/open is a no-op: render.sh opens the page in the
// desktop browser, and this keeps the run headless.
export function makeWorkDir(prefix: string): string {
  const work = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(work, "bin"));
  writeFileSync(join(work, "bin/open"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return work;
}

// Runs render.sh on `brief` and returns the http URL it prints.
export function renderBrief(work: string, brief: string, name: string): string {
  const r = Bun.spawnSync(["bash", join(VIZ, "lib/render.sh"), brief, name], {
    cwd: work, env: { ...process.env, PATH: `${work}/bin:${process.env.PATH}` },
  });
  const url = r.stdout.toString().match(/^URL: (http:\S+)$/m)?.[1];
  if (!url) throw new Error("render.sh gave no http URL:\n" + r.stdout + r.stderr);
  return url;
}

export type CdpEvent = { method?: string; params?: any };
export type Cdp = Awaited<ReturnType<typeof launchBrowser>>;

// Starts the browser and attaches to its first page. `onEvent` sees every CDP
// event; `send` answers one without waiting for a reply.
export async function launchBrowser(opts: {
  port: number; work: string; windowSize: string; extraArgs?: string[];
  onEvent?: (m: CdpEvent, send: (method: string, params?: any) => void) => void;
}) {
  const browser = Bun.spawn([BROWSER, "--headless=new", "--disable-gpu", ...(opts.extraArgs ?? []),
    `--remote-debugging-port=${opts.port}`, `--window-size=${opts.windowSize}`,
    `--user-data-dir=${join(opts.work, "profile")}`, "about:blank"], { stdout: "ignore", stderr: "ignore" });

  let targets: any[] = [];
  for (let i = 0; i < 40 && !targets.length; i++) {
    targets = await fetch(`http://127.0.0.1:${opts.port}/json`).then((r) => r.json()).catch(() => []);
    if (!targets.length) await sleep(250);
  }
  const ws = new WebSocket(targets.find((t: any) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  const send = (method: string, params: any = {}) => { ws.send(JSON.stringify({ id: ++id, method, params })); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data as string);
    if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
    opts.onEvent?.(m, send);
  };
  const cdp = (method: string, params: any = {}) =>
    new Promise<any>((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  async function js(expr: string) {
    const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  }
  async function close(work: string) {
    ws.close();
    browser.kill();
    await browser.exited;
    rmSync(work, { recursive: true, force: true });
  }
  return { cdp, js, close };
}

// Failure bookkeeping. `beforeEach` runs ahead of every scenario (outside its try).
export function makeChecks(beforeEach?: () => Promise<void>) {
  const failures: string[] = [];
  function expectEq(name: string, what: string, got: unknown, want: unknown) {
    if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${name}: ${what} = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
  async function scenario(name: string, body: () => Promise<void>) {
    await beforeEach?.();
    try { await body(); } catch (e) { failures.push(`${name}: threw ${e}`); }
    console.log(`${failures.some((f) => f.startsWith(name + ":")) ? "FAIL" : "ok  "} ${name}`);
  }
  // Prints the failures and sets the exit code, or reports success.
  function finish() {
    if (failures.length) { console.error("\n" + failures.join("\n")); process.exit(1); }
    console.log("\nall scenarios passed");
  }
  return { expectEq, scenario, finish };
}
