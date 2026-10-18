import { describe, expect, test } from "bun:test";
import * as sandbox from "../src/sandbox";
import { resolveAllowedHosts, sandboxOption } from "../src/sandbox";

const DEFAULT_HOSTS = ["registry.npmjs.org", "github.com", "codeload.github.com"];

describe("sandbox settings", () => {
  test("T11: resolveAllowedHosts appends valid entries to the defaults and rejects a bare wildcard", () => {
    expect(resolveAllowedHosts({ MUSTER_ALLOW_HOSTS: "a.org" })).toStrictEqual([...DEFAULT_HOSTS, "a.org"]);
    expect(resolveAllowedHosts({})).toStrictEqual(DEFAULT_HOSTS);
    expect(() => resolveAllowedHosts({ MUSTER_ALLOW_HOSTS: "*" })).toThrow();
  });
});

describe("sandbox option has no filesystem rules", () => {
  test("R2: sandboxOption has no filesystem key, exports no temp-root helper, and ignores tempRoots and runTmp", () => {
    expect("defaultTempRoots" in sandbox).toBe(false);
    const option = sandboxOption({ env: {}, tempRoots: ["/t/a"], runTmp: "/t/run/tmp" } as Parameters<typeof sandboxOption>[0]);
    expect(option).not.toHaveProperty("filesystem");
    expect(JSON.stringify(option)).not.toMatch(/denyWrite|allowWrite/);
  });
});
