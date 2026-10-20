// End-to-end check of the feedback recipe's pick → Save → disk path, in a real
// browser against the real viz server. `bun test` skips this file (no `.test.`
// in the name) because it needs a Chromium and a free port; run it with
// `bun run e2e`. Clicks and keys go through CDP Input events, not el.click():
// a double-click's second click and Space on a focused card only exist there.
//
// Env: VIZ_E2E_BROWSER — a Chromium binary (default: Brave on macOS).
// The CDP plumbing lives in cdp-harness.ts.
import { copyFileSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { VIZ, launchBrowser, makeChecks, makeWorkDir, renderBrief, sleep } from "./cdp-harness";

const CDP_PORT = 9333;

const work = makeWorkDir("viz-e2e-");
const PRISTINE = join(VIZ, "tests/fixtures/feedback/save.md");
const BRIEF = join(work, "save.md");
copyFileSync(PRISTINE, BRIEF);
const URL = renderBrief(work, BRIEF, "save-e2e");

let acceptDialog = true;
const dialogs: string[] = [];
const { cdp, js, close } = await launchBrowser({
  port: CDP_PORT, work, windowSize: "1400,900",
  onEvent(m, send) {
    if (m.method === "Page.javascriptDialogOpening") {
      dialogs.push(m.params.message);
      send("Page.handleJavaScriptDialog", { accept: acceptDialog });
    }
  },
});

const CARD = (q: number, label: string) =>
  `[...document.querySelectorAll('.cv-decision')][${q - 1}].querySelector('.cv-card[data-label="${label}"]')`;
const OPT = (q: number, label: string) =>
  `[...document.querySelectorAll('#decision-panel .question')][${q - 1}].querySelector('.opt[data-label="${label}"]')`;
const SAVE = `document.getElementById('save-btn')`;
const VIEW = (v: string) => `document.querySelector('#view-toggle button[data-view="${v}"]')`;

async function mouse(selExpr: string, clicks = 1) {
  const { x, y } = await js(`(()=>{const e=${selExpr}; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await sleep(50);
  for (let c = 1; c <= clicks; c++) {
    await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: c });
    await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: c });
    await sleep(60);
  }
  await sleep(100);
}
const click = (q: number, label: string, n = 1) => mouse(CARD(q, label), n);
// Space scrolls smoothly; wait it out so the next click lands where the card now is.
async function space() {
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await sleep(1000);
}

const toast = () => js(`document.getElementById('toast').textContent`);
function disk() {
  const fm = readFileSync(BRIEF, "utf8").split("\n---\n")[0];
  return [1, 2, 3].map((i) => (fm.match(new RegExp(`^d${i}\\.choice:(.*)$`, "m"))?.[1] ?? "").trim().replace(/ \| /g, "|"));
}
async function save(clicks = 1) {
  const before = statSync(BRIEF).mtimeMs;
  await mouse(SAVE, clicks);
  for (let i = 0; i < 30 && statSync(BRIEF).mtimeMs === before; i++) await sleep(100);
  await sleep(300);
  return statSync(BRIEF).mtimeMs !== before;
}
async function fresh() {
  copyFileSync(PRISTINE, BRIEF);
  dialogs.length = 0; acceptDialog = true;
  await cdp("Page.navigate", { url: URL + "?t=" + Date.now() });
  for (let i = 0; i < 100; i++) {
    if (await js(`document.querySelectorAll('.cv-card').length > 0`).catch(() => false)) break;
    await sleep(100);
  }
  await sleep(300);
}

const { expectEq, scenario, finish } = makeChecks(fresh);

await cdp("Runtime.enable");
await cdp("Page.enable");

try {
  await scenario("single clicks then one Save", async () => {
    await click(1, "拉麵"); await click(2, "無糖綠茶"); await click(3, "布丁"); await click(3, "蛋糕");
    await save();
    expectEq("single clicks then one Save", "disk", disk(), ["拉麵", "無糖綠茶", "布丁|蛋糕"]);
    expectEq("single clicks then one Save", "receipt", await toast(), "已儲存 — D1 拉麵；D2 無糖綠茶；D3 布丁、蛋糕 — 回終端機確認");
  });
  await scenario("double-click keeps the pick", async () => {
    await click(1, "便當"); await click(2, "美式咖啡", 2); await click(3, "布丁", 2);
    await save();
    expectEq("double-click keeps the pick", "disk", disk(), ["便當", "美式咖啡", "布丁"]);
  });
  await scenario("re-click keeps a single pick", async () => {
    await click(1, "便當"); await click(1, "便當"); await click(2, "白開水"); await click(3, "蛋糕");
    await save();
    expectEq("re-click keeps a single pick", "disk", disk(), ["便當", "白開水", "蛋糕"]);
  });
  await scenario("Space scrolls instead of toggling", async () => {
    await click(1, "沙拉");
    const y0 = await js(`scrollY`); await space();
    expectEq("Space scrolls instead of toggling", "scrolled", (await js(`scrollY`)) > y0, true);
    await click(2, "白開水"); await space(); await click(3, "蛋糕"); await space();
    await save();
    expectEq("Space scrolls instead of toggling", "disk", disk(), ["沙拉", "白開水", "蛋糕"]);
  });
  await scenario("partial Save asks first; accept writes the blanks", async () => {
    await click(1, "便當");
    await save();
    expectEq("partial Save asks first; accept writes the blanks", "dialogs", dialogs.length, 1);
    expectEq("partial Save asks first; accept writes the blanks", "disk", disk(), ["便當", "", ""]);
    await click(2, "白開水"); await click(3, "冰淇淋");
    await save();
    expectEq("partial Save asks first; accept writes the blanks", "disk after second Save", disk(), ["便當", "白開水", "冰淇淋"]);
  });
  await scenario("partial Save, dismissed, writes nothing", async () => {
    await click(1, "便當"); acceptDialog = false;
    expectEq("partial Save, dismissed, writes nothing", "saved", await save(), false);
  });
  await scenario("multi un-pick and single re-pick", async () => {
    await click(1, "便當"); await click(1, "沙拉"); await click(2, "白開水");
    await click(3, "布丁"); await click(3, "蛋糕"); await click(3, "布丁");
    await save();
    expectEq("multi un-pick and single re-pick", "disk", disk(), ["沙拉", "白開水", "蛋糕"]);
  });
  await scenario("answers survive a view switch and the plain view", async () => {
    await click(1, "便當");
    await mouse(VIEW("plain"));
    await mouse(OPT(2, "美式咖啡")); await mouse(OPT(3, "布丁")); await mouse(OPT(3, "冰淇淋"));
    await mouse(VIEW("cards"));
    await save();
    expectEq("answers survive a view switch and the plain view", "disk", disk(), ["便當", "美式咖啡", "布丁|冰淇淋"]);
  });
  await scenario("double-clicked Save writes once", async () => {
    await click(1, "沙拉"); await click(2, "珍珠奶茶"); await click(3, "蛋糕");
    await save(2); await sleep(1000);
    expectEq("double-clicked Save writes once", "disk", disk(), ["沙拉", "珍珠奶茶", "蛋糕"]);
  });
  await scenario("conflict stays on screen, clear of the banner", async () => {
    await click(1, "拉麵");
    writeFileSync(BRIEF, readFileSync(BRIEF, "utf8"));
    await sleep(2600);
    await click(2, "白開水"); await click(3, "布丁");
    expectEq("conflict stays on screen, clear of the banner", "first Save landed", await save(), false);
    await sleep(3000);
    expectEq("conflict stays on screen, clear of the banner", "toast still shown",
      await js(`document.getElementById('toast').classList.contains('show')`), true);
    expectEq("conflict stays on screen, clear of the banner", "toast overlaps banner",
      await js(`(()=>{const a=document.getElementById('toast').getBoundingClientRect(),b=document.getElementById('reload-banner').getBoundingClientRect();return a.bottom>b.top&&b.bottom>a.top;})()`), false);
    await save();
    expectEq("conflict stays on screen, clear of the banner", "disk", disk(), ["拉麵", "白開水", "布丁"]);
  });
} finally {
  await close(work);
}

finish();
