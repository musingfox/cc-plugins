import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fence, { canon, checkToolCall, inside } from "./worktree-fence";

// /tmp is a symlink to /private/tmp on macOS; WORK is kept un-resolved on purpose
// so every assertion also covers the realpath seam.
const ROOT = mkdtempSync(join(tmpdir(), "fence-"));
const WORK = join(ROOT, "shards", "A", "work");
const OTHER = join(ROOT, "real-repo");
mkdirSync(WORK, { recursive: true });
mkdirSync(OTHER, { recursive: true });
const CW = canon(WORK);

describe("inside", () => {
  test("worktree itself and its children, through the realpath seam", () => {
    expect(inside(CW, WORK)).toBe(true);
    expect(inside(CW, realpathSync(WORK))).toBe(true);
    expect(inside(CW, join(WORK, "src", "new-file.ts"))).toBe(true);
  });
  test("sibling with a shared prefix is outside", () => {
    expect(inside(CW, WORK + "-other")).toBe(false);
    expect(inside(CW, OTHER)).toBe(false);
  });
});

describe("write / edit", () => {
  test("inside the worktree passes, relative or absolute", () => {
    expect(checkToolCall("write", { path: join(WORK, "a.ts") }, CW)).toBeUndefined();
    expect(checkToolCall("edit", { path: "src/a.ts" }, CW)).toBeUndefined();
  });
  test("outside the worktree blocks", () => {
    expect(checkToolCall("write", { path: join(OTHER, "a.ts") }, CW)?.block).toBe(true);
    expect(checkToolCall("edit", { path: "../../../real-repo/a.ts" }, CW)?.block).toBe(true);
  });
  test("~ and @ prefixes resolve the way pi resolves them", () => {
    expect(checkToolCall("write", { path: "~/x.ts" }, CW)?.block).toBe(true);
    expect(checkToolCall("write", { path: "@" + join(OTHER, "x.ts") }, CW)?.block).toBe(true);
    expect(checkToolCall("write", { path: "@" + join(WORK, "x.ts") }, CW)).toBeUndefined();
  });
  test("read and bash are never fenced here", () => {
    expect(checkToolCall("read", { path: join(OTHER, "a.ts") }, CW)).toBeUndefined();
    expect(checkToolCall("bash", { command: `git -C ${OTHER} reset --hard` }, CW)).toBeUndefined();
  });
});

describe("the pi seam", () => {
  const fakePi = () => {
    const handlers: Record<string, Function> = {};
    return { pi: { on: (name: string, fn: Function) => { handlers[name] = fn; } } as any, handlers };
  };
  test("registers nothing without PI_CWD", () => {
    const saved = process.env.PI_CWD;
    delete process.env.PI_CWD;
    const { pi, handlers } = fakePi();
    fence(pi);
    expect(Object.keys(handlers)).toEqual([]);
    if (saved !== undefined) process.env.PI_CWD = saved;
  });
  test("with PI_CWD, the tool_call handler blocks with a reason and no terminate", async () => {
    process.env.PI_CWD = WORK;
    const { pi, handlers } = fakePi();
    fence(pi);
    expect(Object.keys(handlers)).toEqual(["tool_call"]);
    const verdict = await handlers.tool_call({ toolName: "write", input: { path: join(OTHER, "x") } }, {});
    expect(verdict.block).toBe(true);
    expect(verdict.reason).toContain("worktree-fence");
    expect("terminate" in verdict).toBe(false);
    expect(await handlers.tool_call({ toolName: "write", input: { path: join(WORK, "x") } }, {})).toBeUndefined();
    delete process.env.PI_CWD;
  });
});

describe("declared writable files", () => {
  // D sits outside WORK. TMP_D is spelled /tmp/... so the /private/tmp seam is covered.
  const D = join(ROOT, "declared");
  mkdirSync(D, { recursive: true });
  const TMP_D = mkdtempSync("/tmp/fence-declared-");
  afterAll(() => rmSync(TMP_D, { recursive: true, force: true }));
  const REPORT = join(D, "report.md");
  const set = new Set([canon(REPORT)]);

  test("the declared file passes for write and edit", () => {
    expect(checkToolCall("write", { path: REPORT }, CW, set)).toBeUndefined();
    expect(checkToolCall("edit", { path: REPORT }, CW, set)).toBeUndefined();
  });
  test("a sibling of the declared file stays blocked", () => {
    expect(checkToolCall("write", { path: join(D, "sibling.md") }, CW, set)?.block).toBe(true);
  });
  test("an entry and a tool path in different spellings of the same file match", () => {
    const entry = join(TMP_D, "report.md");
    const toolPath = join(realpathSync(TMP_D), "report.md");
    expect(checkToolCall("write", { path: toolPath }, CW, new Set([canon(entry)]))).toBeUndefined();
  });
  test("a declared directory does not open the files under it", () => {
    expect(checkToolCall("write", { path: REPORT }, CW, new Set([canon(D)]))?.block).toBe(true);
  });
  test("without an allowed set the declared file is blocked", () => {
    expect(checkToolCall("write", { path: REPORT }, CW)?.block).toBe(true);
  });
  test("a declared file under the OS temp dir passes; its sibling does not", () => {
    const T = mkdtempSync(join(tmpdir(), "fence-tmpdecl-"));
    const s = new Set([canon(join(T, "report.md"))]);
    expect(checkToolCall("write", { path: join(T, "report.md") }, CW, s)).toBeUndefined();
    expect(checkToolCall("write", { path: join(T, "sibling.md") }, CW, s)?.block).toBe(true);
    rmSync(T, { recursive: true, force: true });
  });

  const fakePi = () => {
    const handlers: Record<string, Function> = {};
    return { pi: { on: (name: string, fn: Function) => { handlers[name] = fn; } } as any, handlers };
  };
  test("the pi seam reads PI_WRITABLE_FILES at load", async () => {
    process.env.PI_CWD = WORK;
    process.env.PI_WRITABLE_FILES = REPORT;
    const { pi, handlers } = fakePi();
    fence(pi);
    expect(await handlers.tool_call({ toolName: "write", input: { path: REPORT } }, {})).toBeUndefined();
    expect((await handlers.tool_call({ toolName: "write", input: { path: join(D, "sibling.md") } }, {})).block).toBe(true);
    delete process.env.PI_CWD;
    delete process.env.PI_WRITABLE_FILES;
  });
  test("a list of only separators declares nothing", async () => {
    process.env.PI_CWD = WORK;
    process.env.PI_WRITABLE_FILES = ":";
    const { pi, handlers } = fakePi();
    fence(pi);
    expect((await handlers.tool_call({ toolName: "write", input: { path: REPORT } }, {})).block).toBe(true);
    delete process.env.PI_CWD;
    delete process.env.PI_WRITABLE_FILES;
  });
});
