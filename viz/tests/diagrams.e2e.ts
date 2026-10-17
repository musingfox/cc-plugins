// End-to-end checks of how the viz pages draw diagrams with Pele, in a real
// browser against the real render.sh output. `bun test` skips this file (no
// `.test.` in the name) because it needs a Chromium and a free port; run it
// with `bun run e2e`. Waits use the real clock; nothing is mocked except the
// network requests a scenario deliberately fails through CDP Fetch.
//
// Env: VIZ_E2E_BROWSER — a Chromium binary (default: Brave on macOS).
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const VIZ = join(import.meta.dir, "..");
const BROWSER = process.env.VIZ_E2E_BROWSER ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const CDP_PORT = 9334;
const FIXTURES = join(VIZ, "tests/fixtures/diagrams");
const DIAGRAM_TYPES = join(VIZ, "skills/viz-render/references/diagram-types.md");
const EDGE_CASES = join(FIXTURES, "edge-cases.md");
const FEEDBACK = join(FIXTURES, "feedback.md");

const work = mkdtempSync(join(tmpdir(), "viz-diagrams-e2e-"));
mkdirSync(join(work, "bin"));
// render.sh opens the page in the desktop browser; a no-op `open` keeps it headless.
writeFileSync(join(work, "bin/open"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

let renderCount = 0;
// Renders a markdown file (optionally with extra text appended) and returns its http URL.
function render(src: string, extra = ""): string {
  const name = `diag-${++renderCount}`;
  const brief = join(work, name + ".md");
  if (extra) writeFileSync(brief, readFileSync(src, "utf8") + extra);
  else copyFileSync(src, brief);
  const r = Bun.spawnSync(["bash", join(VIZ, "lib/render.sh"), brief, name], {
    cwd: work, env: { ...process.env, PATH: `${work}/bin:${process.env.PATH}` },
  });
  const url = r.stdout.toString().match(/^URL: (http:\S+)$/m)?.[1];
  if (!url) throw new Error("render.sh gave no http URL:\n" + r.stdout + r.stderr);
  return url;
}
const countFences = (path: string) => (readFileSync(path, "utf8").match(/^```mermaid\s*$/gm) ?? []).length;

const browser = Bun.spawn([BROWSER, "--headless=new", "--disable-gpu", `--remote-debugging-port=${CDP_PORT}`,
  "--window-size=1100,900", `--user-data-dir=${join(work, "profile")}`, "about:blank"], { stdout: "ignore", stderr: "ignore" });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let targets: any[] = [];
for (let i = 0; i < 40 && !targets.length; i++) {
  targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then((r) => r.json()).catch(() => []);
  if (!targets.length) await sleep(250);
}
const ws = new WebSocket(targets.find((t: any) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
// Requests whose URL matches this pattern fail (BlockedByClient); all others continue.
let blockedUrl: RegExp | null = null;
const pending = new Map<number, (v: any) => void>();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data as string);
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
  if (m.method === "Fetch.requestPaused") {
    const fail = blockedUrl?.test(m.params.request.url);
    ws.send(JSON.stringify({ id: ++id, method: fail ? "Fetch.failRequest" : "Fetch.continueRequest",
      params: fail ? { requestId: m.params.requestId, errorReason: "BlockedByClient" } : { requestId: m.params.requestId } }));
  }
};
const cdp = (method: string, params: any = {}) =>
  new Promise<any>((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function js(expr: string) {
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
// Polls a page expression on the real clock, up to 30 s.
async function waitFor(expr: string) {
  for (let i = 0; i < 300; i++) {
    if (await js(expr).catch(() => false)) return true;
    await sleep(100);
  }
  return false;
}
const ALL_DRAWN = `[...document.querySelectorAll('.mermaid')].every((n) => n.querySelector('svg') || n.classList.contains('pele-error'))`;

async function open(url: string, blockPattern: RegExp | null = null) {
  blockedUrl = blockPattern;
  // The feedback page remembers the last view; every scenario starts from its default.
  await js(`localStorage.clear()`).catch(() => {});
  // A cached script would skip the paused request, so a blocked load must hit the network.
  await cdp("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp("Fetch.disable");
  if (blockPattern) await cdp("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await cdp("Page.navigate", { url });
  await sleep(300);
  await waitFor(`document.readyState === 'complete'`);
}

const failures: string[] = [];
function expectEq(name: string, what: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${name}: ${what} = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}
async function scenario(name: string, body: () => Promise<void>) {
  try { await body(); } catch (e) { failures.push(`${name}: threw ${e}`); }
  console.log(`${failures.some((f) => f.startsWith(name + ":")) ? "FAIL" : "ok  "} ${name}`);
}

await cdp("Runtime.enable");
await cdp("Page.enable");

try {
  // TemplateRendersDiagramsOnLoad
  const typesUrl = render(DIAGRAM_TYPES);
  const N = countFences(DIAGRAM_TYPES);
  const T1 = "TemplateRendersDiagramsOnLoad T1";
  await scenario(T1, async () => {
    await open(typesUrl);
    await waitFor(ALL_DRAWN);
    expectEq(T1, "fence count >= 11", N >= 11, true);
    expectEq(T1, "canvases with svg.pele", await js(`document.querySelectorAll('.mermaid svg.pele').length`), N);
    expectEq(T1, "pele-error count", await js(`document.querySelectorAll('.pele-error').length`), 0);
    expectEq(T1, "typeof window.mermaid", await js(`typeof window.mermaid`), "undefined");
    expectEq(T1, "typeof window.pele", await js(`typeof window.pele`), "object");
  });

  await scenario("TemplateRendersDiagramsOnLoad T2", async () => {
    const init = await cdp("Page.addScriptToEvaluateOnNewDocument", { source:
      `Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });` +
      `window.__vc = 0; document.addEventListener('visibilitychange', () => window.__vc++);` });
    await open(typesUrl);
    await waitFor(ALL_DRAWN);
    await cdp("Page.removeScriptToEvaluateOnNewDocument", { identifier: init.result.identifier });
    expectEq("TemplateRendersDiagramsOnLoad T2", "svg.pele with hidden tab", await js(`document.querySelectorAll('.mermaid svg.pele').length`), N);
    expectEq("TemplateRendersDiagramsOnLoad T2", "visibilitychange fired", await js(`window.__vc`), 0);
  });

  await scenario("TemplateRendersDiagramsOnLoad T3", async () => {
    await open(typesUrl);
    await waitFor(ALL_DRAWN);
    const ids = await js(`[...document.querySelectorAll('.mermaid [id]')].map((e) => e.id)`);
    expectEq("TemplateRendersDiagramsOnLoad T3", "duplicate ids", ids.length - new Set(ids).size, 0);
  });

  await scenario("TemplateRendersDiagramsOnLoad T4", async () => {
    await open(typesUrl, /pele\.global\.js/);
    await sleep(1500);
    expectEq("TemplateRendersDiagramsOnLoad T4", "svg.pele", await js(`document.querySelectorAll('.mermaid svg').length`), 0);
    expectEq("TemplateRendersDiagramsOnLoad T4", "canvases with source text",
      await js(`[...document.querySelectorAll('.mermaid')].filter((n) => n.textContent.trim().length > 0).length`), N);
    expectEq("TemplateRendersDiagramsOnLoad T4", "h1 present", await js(`!!document.querySelector('#content h1')`), true);
    expectEq("TemplateRendersDiagramsOnLoad T4", "Error: prefix", await js(`document.body.innerText.startsWith('Error:')`), false);
    await cdp("Fetch.disable");
  });

  await scenario("TemplateRendersDiagramsOnLoad T5", async () => {
    await open(typesUrl);
    await waitFor(ALL_DRAWN);
    await js(`document.querySelector('.mermaid-shell [data-action="zoom-in"]').click()`);
    expectEq("TemplateRendersDiagramsOnLoad T5", "first canvas scaled", await js(`document.querySelector('.mermaid').style.transform.includes('scale(1.3')`), true);
  });

  await scenario("TemplateRendersDiagramsOnLoad T6", async () => {
    await open(typesUrl);
    await waitFor(ALL_DRAWN);
    const over = await js(`[...document.querySelectorAll('.mermaid svg.pele')].filter((s) => {
      const vp = s.closest('.mermaid-viewport'), cs = getComputedStyle(vp);
      const content = vp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return s.getBoundingClientRect().width > content + 1;
    }).length`);
    expectEq("TemplateRendersDiagramsOnLoad T6", "svg wider than viewport content", over, 0);
  });
  // FeedbackRendersDiagrams
  const feedbackUrl = render(FEEDBACK);
  const BRIEF_DRAWN = `[...document.querySelectorAll('#brief .mermaid')].length === 2 && ${ALL_DRAWN.replace("document.querySelectorAll('.mermaid')", "document.querySelectorAll('#brief .mermaid')")}`;
  // The fixture's table opens in the card view; #brief holds the diagrams only in the plain (原文) view.
  const PLAIN = `document.querySelector('#view-toggle button[data-view="plain"]').click()`;
  await scenario("FeedbackRendersDiagrams T1", async () => {
    await open(feedbackUrl);
    await js(PLAIN);
    await waitFor(BRIEF_DRAWN);
    expectEq("FeedbackRendersDiagrams T1", "#brief .mermaid count", await js(`document.querySelectorAll('#brief .mermaid').length`), 2);
    expectEq("FeedbackRendersDiagrams T1", "first canvas svg.pele", await js(`!!document.querySelector('#brief .mermaid svg.pele')`), true);
    expectEq("FeedbackRendersDiagrams T1", "second canvas error text", await js(`document.querySelectorAll('#brief .mermaid')[1].textContent.includes('Parse error') && document.querySelectorAll('#brief .mermaid')[1].classList.contains('pele-error')`), true);
    expectEq("FeedbackRendersDiagrams T1", "typeof window.mermaid", await js(`typeof window.mermaid`), "undefined");
  });
  await scenario("FeedbackRendersDiagrams T2", async () => {
    await open(feedbackUrl);
    await waitFor(BRIEF_DRAWN);
    expectEq("FeedbackRendersDiagrams T2", "option cards present", await js(`document.querySelectorAll('.cv-card').length > 0`), true);
  });
  await scenario("FeedbackRendersDiagrams T3", async () => {
    await open(feedbackUrl, /pele\.global\.js/);
    await js(PLAIN);
    await sleep(1500);
    expectEq("FeedbackRendersDiagrams T3", "plain view source text",
      await js(`[...document.querySelectorAll('#brief .mermaid')].filter((n) => n.textContent.trim().length > 0).length`), 2);
    await js(`document.querySelector('#view-toggle button[data-view="cards"]').click()`);
    await sleep(300);
    expectEq("FeedbackRendersDiagrams T3", "svg count", await js(`document.querySelectorAll('#brief .mermaid svg').length`), 0);
    expectEq("FeedbackRendersDiagrams T3", "canvases with source text",
      await js(`[...document.querySelectorAll('#brief .mermaid')].filter((n) => n.textContent.trim().length > 0).length`), 2);
    expectEq("FeedbackRendersDiagrams T3", "option cards present", await js(`document.querySelectorAll('.cv-card').length > 0`), true);
    await cdp("Fetch.disable");
  });
} finally {
  ws.close();
  browser.kill();
  await browser.exited;
  rmSync(work, { recursive: true, force: true });
}

if (failures.length) { console.error("\n" + failures.join("\n")); process.exit(1); }
console.log("\nall scenarios passed");
