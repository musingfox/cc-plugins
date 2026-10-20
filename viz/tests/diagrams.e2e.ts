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

const browser = Bun.spawn([BROWSER, "--headless=new", "--disable-gpu", "--force-color-profile=srgb", `--remote-debugging-port=${CDP_PORT}`,
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
  // PageDiagramErrorsInline
  const edgeUrl = render(EDGE_CASES);
  await scenario("PageDiagramErrorsInline T1", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    const truncated = `document.querySelectorAll('.mermaid.pele-error')[0]`;
    expectEq("PageDiagramErrorsInline T1", "pele-error count", await js(`document.querySelectorAll('.mermaid.pele-error').length`), 3);
    expectEq("PageDiagramErrorsInline T1", "truncated text", await js(`${truncated}.textContent.includes('Parse error')`), true);
    expectEq("PageDiagramErrorsInline T1", "truncated children", await js(`${truncated}.children.length`), 0);
  });
  await scenario("PageDiagramErrorsInline T2", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    expectEq("PageDiagramErrorsInline T2", "unknown text", await js(`document.querySelectorAll('.mermaid.pele-error')[1].textContent`), "No diagram type detected for the given text.");
  });
  await scenario("PageDiagramErrorsInline T3", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    expectEq("PageDiagramErrorsInline T3", "valid svg.pele", await js(`document.querySelector('.mermaid svg.pele') !== null`), true);
    expectEq("PageDiagramErrorsInline T3", "h1 present", await js(`!!document.querySelector('#content h1')`), true);
  });
  await scenario("PageDiagramErrorsInline T4", async () => {
    const big = ("graph TD\n" + "A-->B\n".repeat(10000)).slice(0, 60000);
    const url = render(EDGE_CASES, "\n```mermaid\n" + big + "\n```\n");
    await open(url);
    await waitFor(ALL_DRAWN);
    expectEq("PageDiagramErrorsInline T4", "oversize pele-error text non-empty",
      await js(`document.querySelectorAll('.mermaid.pele-error')[document.querySelectorAll('.mermaid.pele-error').length - 1].textContent.length > 0`), true);
    expectEq("PageDiagramErrorsInline T4", "valid svg.pele", await js(`document.querySelector('.mermaid svg.pele') !== null`), true);
  });
  await scenario("PageDiagramErrorsInline T5", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    expectEq("PageDiagramErrorsInline T5", "content starts with Error:", await js(`document.getElementById('content').textContent.trimStart().startsWith('Error:')`), false);
  });
  // DiagramTextStaysInert
  await scenario("DiagramTextStaysInert T1", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    expectEq("DiagramTextStaysInert T1", "live img, script or on* attributes",
      await js(`document.querySelectorAll('.mermaid img, .mermaid script, .mermaid [onerror]').length`), 0);
    expectEq("DiagramTextStaysInert T1", "window.__pwned", await js(`window.__pwned === undefined`), true);
  });
  await scenario("DiagramTextStaysInert T2", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    const hostile = `[...document.querySelectorAll('.mermaid.pele-error')].find((n) => n.textContent.includes('<img'))`;
    expectEq("DiagramTextStaysInert T2", "hostile error node exists", await js(`!!${hostile}`), true);
    expectEq("DiagramTextStaysInert T2", "child elements", await js(`${hostile}.children.length`), 0);
    expectEq("DiagramTextStaysInert T2", "window.__pwned", await js(`window.__pwned === undefined`), true);
  });
  // LogosIconsVisible. edge-cases.md stays logos-free, so the unknown-icon case is appended at run time.
  const ICONS = `performance.getEntriesByType('resource').filter((e) => e.name.includes('icons.json')).length`;
  const UNKNOWN = "\n```mermaid\narchitecture-beta\n    group edge[Edge]\n    service x(logos:does-not-exist)[Missing] in edge\n```\n";
  await scenario("LogosIconsVisible T1", async () => {
    await open(typesUrl);
    await waitFor(ALL_DRAWN);
    expectEq("LogosIconsVisible T1", ".pele-icon count", await js(`document.querySelectorAll('.pele-icon').length`), 3);
    expectEq("LogosIconsVisible T1", "icons with a drawn shape", await js(`[...document.querySelectorAll('.pele-icon')].filter((i) => [...i.querySelectorAll('path, g')].some((e) => e.getBoundingClientRect().width > 0)).length`), 3);
  });
  await scenario("LogosIconsVisible T2", async () => {
    await open(typesUrl);
    await waitFor(ALL_DRAWN);
    expectEq("LogosIconsVisible T2", "icons.json requests on diagram-types", await js(ICONS), 1);
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    expectEq("LogosIconsVisible T2", "icons.json requests on edge-cases", await js(ICONS), 0);
  });
  await scenario("LogosIconsVisible T3", async () => {
    await open(render(EDGE_CASES, UNKNOWN));
    await waitFor(ALL_DRAWN);
    expectEq("LogosIconsVisible T3", "unknown icon: pele-error count", await js(`document.querySelectorAll('.pele-error').length`), 3);
    expectEq("LogosIconsVisible T3", "unknown icon: svg.pele exists", await js(`document.querySelectorAll('.mermaid svg.pele').length >= 2`), true);
  });
  await scenario("LogosIconsVisible T4", async () => {
    await open(typesUrl, /icons\.json/);
    await waitFor(ALL_DRAWN);
    expectEq("LogosIconsVisible T4", "architecture still svg.pele", await js(`!!document.querySelector('.mermaid svg.pele')`), true);
    expectEq("LogosIconsVisible T4", "pele-error count", await js(`document.querySelectorAll('.pele-error').length`), 0);
    await cdp("Fetch.disable");
  });
  // DiagramPalette
  // Resolves any CSS color (var(), color-mix()) to [r, g, b, a] by a computed-style round trip. A canvas
  // readback is not used: Brave perturbs canvas pixels by one step, so it cannot prove an exact value.
  const RGB = (expr: string) => `((e) => { const p = document.createElement('span'); p.style.color = e;
    document.body.appendChild(p); const v = getComputedStyle(p).color; p.remove();
    const n = v.match(/[\\d.]+/g).map(Number), k = v.startsWith('color(') ? 255 : 1;
    return [0, 1, 2].map((i) => Math.round(n[i] * k)).concat([n.length > 3 ? Math.round(n[3] * 255) : 255]); })(${expr})`;
  const LUM = `(c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }`;
  const CONTRAST = `(a, b) => { const x = (${LUM})(a), y = (${LUM})(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }`;
  const PELE_DEFAULTS = ["#4c78a8", "#f58518", "#54a24b", "#e45756", "#72b7b2", "#eeca3b", "#b279a2", "#9d755d"];
  const LIGHT_DEFAULTS = ["rgb(138, 138, 138)", "rgb(91, 123, 213)", "rgb(243, 243, 243)", "rgb(230, 230, 230)", "rgb(31, 31, 31)", "rgb(110, 110, 110)", "rgb(255, 255, 255)"];
  const diagramBg = (el: string) => RGB(`getComputedStyle(${el}).getPropertyValue('--pele-bg')`);

  await scenario("DiagramPalette T1", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    const [node, cluster] = await js(`[getComputedStyle(document.querySelector('.pele-node rect')).stroke, getComputedStyle(document.querySelector('.pele-cluster > rect')).stroke]`);
    expectEq("DiagramPalette T1", "node and cluster strokes", [node, cluster], ["rgb(218, 112, 44)", "rgb(52, 51, 49)"]);
  });
  await scenario("DiagramPalette T2", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    expectEq("DiagramPalette T2", "generic --pele-bg pixel", await js(`${diagramBg("document.querySelector('.mermaid')")}`), [28, 27, 26, 255]);
    await open(feedbackUrl);
    await js(PLAIN);
    await waitFor(BRIEF_DRAWN);
    expectEq("DiagramPalette T2", "feedback --pele-bg pixel", await js(`${diagramBg("document.querySelector('#brief .mermaid')")}`), [40, 39, 38, 255]);
  });
  await scenario("DiagramPalette T3", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    const r = await js(`(() => {
      const canvas = ${RGB("'#000'")};
      const slices = [...document.querySelectorAll('.pele-slice')];
      const rgb = (el) => ${RGB("getComputedStyle(el).fill")}.slice(0, 3);
      const bg = ${RGB("getComputedStyle(document.querySelector('.mermaid')).getPropertyValue('--pele-bg')")}.slice(0, 3);
      const fills = slices.map(rgb);
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const defaults = ${JSON.stringify(PELE_DEFAULTS)}.map((h) => ${RGB("h")}.slice(0, 3));
      let minDist = Infinity;
      fills.forEach((a, i) => fills.forEach((b, j) => { if (j > i) minDist = Math.min(minDist, dist(a, b)); }));
      const pct = [...document.querySelectorAll('.mermaid svg text')].filter((t) => t.textContent.includes('%'));
      return {
        count: slices.length,
        minDist,
        defaultHits: fills.filter((f) => defaults.some((d) => dist(f, d) === 0)).length,
        lowContrast: fills.filter((f) => (${CONTRAST})(f, bg) < 3).length,
        pctFill: pct.length ? ${RGB("getComputedStyle(pct[0]).fill")}.slice(0, 3) : null,
        bg,
      };
    })()`);
    expectEq("DiagramPalette T3", "slice count", r.count, 8);
    expectEq("DiagramPalette T3", "pairwise RGB distance >= 40", r.minDist >= 40, true);
    expectEq("DiagramPalette T3", "slices equal to a Pele default", r.defaultHits, 0);
    expectEq("DiagramPalette T3", "slices below 3:1 against bg", r.lowContrast, 0);
    expectEq("DiagramPalette T3", "percentage label fill", r.pctFill, r.bg);
  });
  await scenario("DiagramPalette T4", async () => {
    await open(typesUrl);
    await waitFor(ALL_DRAWN);
    const hits = await js(`(() => {
      const forbidden = ${JSON.stringify(LIGHT_DEFAULTS)};
      return [...document.querySelectorAll('.mermaid')]
        .filter((m) => !/^\\s*(style|classDef)\\b/m.test(m.dataset.src))
        .flatMap((m) => [...m.querySelectorAll('svg *')].filter((e) => !e.closest('.pele-icon')).flatMap((e) => {
          const cs = getComputedStyle(e);
          return [cs.fill, cs.stroke].filter((v) => forbidden.includes(v));
        })).length;
    })()`);
    expectEq("DiagramPalette T4", "light-default fills or strokes", hits, 0);
  });
  await scenario("DiagramPalette T5", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    const err = await js(`(() => { const n = document.querySelector('.mermaid.pele-error'); const cs = getComputedStyle(n);
      return [cs.color, cs.whiteSpace]; })()`);
    expectEq("DiagramPalette T5", "error color and whitespace", err, ["rgb(206, 93, 151)", "pre-wrap"]);
  });
  await scenario("DiagramPalette T6", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    expectEq("DiagramPalette T6", "--pele-font", await js(`getComputedStyle(document.querySelector('.mermaid')).getPropertyValue('--pele-font').trim().replace(/["']/g, '').startsWith('Fira Code')`), true);
  });
  // PrintPalette: printing swaps colors by CSS alone; no diagram is re-rendered.
  const media = (m: string) => cdp("Emulation.setEmulatedMedia", { media: m });
  await scenario("PrintPalette T1", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    await js(`document.querySelector('.mermaid svg').setAttribute('data-mark', '1'); window.__renders = 0;
      const p = window.pele; const render = p.render.bind(p); p.render = (...a) => { window.__renders++; return render(...a); };`);
    await media("print");
    await sleep(300);
    expectEq("PrintPalette T1", "marked svg kept", await js(`!!document.querySelector('svg[data-mark="1"]')`), true);
    expectEq("PrintPalette T1", "pele.render calls", await js(`window.__renders`), 0);
    expectEq("PrintPalette T1", "shell background", await js(`getComputedStyle(document.querySelector('.mermaid-shell')).backgroundColor`), "rgb(255, 255, 255)");
    await media("");
  });
  await scenario("PrintPalette T2", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    await media("print");
    await sleep(300);
    const r = await js(`(() => {
      const lum = ${LUM};
      const fill = ${RGB("getComputedStyle(document.querySelector('.pele-node rect')).fill")}.slice(0, 3);
      const label = ${RGB("getComputedStyle(document.querySelector('.pele-label')).fill")}.slice(0, 3);
      const contrast = (${CONTRAST})(fill, label);
      return { lum: lum(fill), contrast };
    })()`);
    expectEq("PrintPalette T2", "node fill luminance >= 0.85", r.lum >= 0.85, true);
    expectEq("PrintPalette T2", "label contrast >= 4.5", r.contrast >= 4.5, true);
    await media("");
  });
  await scenario("PrintPalette T3", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    await media("print");
    await sleep(300);
    const r = await js(`(() => {
      const white = [255, 255, 255, 255];
      const slices = [...document.querySelectorAll('.pele-slice')].map((el) => ${RGB("getComputedStyle(el).fill")}.slice(0, 3));
      const pct = [...document.querySelectorAll('.mermaid svg text')].filter((t) => t.textContent.includes('%'));
      return { count: slices.length, low: slices.filter((f) => (${CONTRAST})(f, white.slice(0, 3)) < 3).length,
        pct: pct.length ? ${RGB("getComputedStyle(pct[0]).fill")} : null };
    })()`);
    expectEq("PrintPalette T3", "slice count", r.count, 8);
    expectEq("PrintPalette T3", "slices below 3:1 against white", r.low, 0);
    expectEq("PrintPalette T3", "percentage label fill", r.pct, [255, 255, 255, 255]);
    await media("");
  });
  await scenario("PrintPalette T4", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    await js(`document.querySelector('.mermaid svg').setAttribute('data-mark', '1')`);
    await media("print");
    await sleep(200);
    await media("");
    await sleep(200);
    expectEq("PrintPalette T4", "node stroke on screen", await js(`getComputedStyle(document.querySelector('.pele-node rect')).stroke`), "rgb(218, 112, 44)");
    expectEq("PrintPalette T4", "marked svg kept", await js(`!!document.querySelector('svg[data-mark="1"]')`), true);
  });
  // StandaloneDiagramTab: the expanded diagram keeps the page's palette in its own tab.
  const EXPAND = `window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; };`;
  const openTab = async () => {
    await js(EXPAND);
    await js(`document.querySelector('.mermaid-shell [data-action="expand"]').click()`);
    return js(`window.__opened.length ? window.__opened[0] : null`);
  };
  const tabFrame = async (url: string) => js(`(async () => {
    const f = document.createElement('iframe'); f.style.width = '1100px'; f.style.height = '900px';
    f.src = ${JSON.stringify(url)}; document.body.appendChild(f);
    await new Promise((r) => (f.onload = r));
    window.__frame = f; return true; })()`);
  await scenario("StandaloneDiagramTab T1", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    const url = await openTab();
    expectEq("StandaloneDiagramTab T1", "captured blob URL", String(url).startsWith("blob:"), true);
    await tabFrame(url);
    expectEq("StandaloneDiagramTab T1", "node stroke", await js(`getComputedStyle(window.__frame.contentDocument.querySelector('.pele-node rect')).stroke`), "rgb(218, 112, 44)");
    expectEq("StandaloneDiagramTab T1", "cluster stroke", await js(`getComputedStyle(window.__frame.contentDocument.querySelector('.pele-cluster > rect')).stroke`), "rgb(52, 51, 49)");
    expectEq("StandaloneDiagramTab T1", "body background", await js(`getComputedStyle(window.__frame.contentDocument.body).backgroundColor`), "rgb(16, 15, 15)");
  });
  await scenario("StandaloneDiagramTab T2", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    await tabFrame(await openTab());
    expectEq("StandaloneDiagramTab T2", "script elements in tab", await js(`window.__frame.contentDocument.querySelectorAll('script').length`), 0);
  });
  await scenario("StandaloneDiagramTab T3", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    await js(EXPAND);
    await js(`[...document.querySelectorAll('.mermaid-shell')].find((sh) => sh.querySelector('.pele-error')).querySelector('[data-action="expand"]').click()`);
    expectEq("StandaloneDiagramTab T3", "window.open calls on error node", await js(`window.__opened.length`), 0);
  });
  await scenario("StandaloneDiagramTab T4", async () => {
    await open(edgeUrl);
    await waitFor(ALL_DRAWN);
    await tabFrame(await openTab());
    expectEq("StandaloneDiagramTab T4", "svg within 95vw", await js(`window.__frame.contentDocument.querySelector('svg').getBoundingClientRect().width <= 0.95 * window.__frame.contentWindow.innerWidth + 1`), true);
  });
} finally {
  ws.close();
  browser.kill();
  await browser.exited;
  rmSync(work, { recursive: true, force: true });
}

if (failures.length) { console.error("\n" + failures.join("\n")); process.exit(1); }
console.log("\nall scenarios passed");
