import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import * as sandbox from "../src/sandbox";
import { resolveAllowedHosts, sandboxOption } from "../src/sandbox";

const DEFAULT_HOSTS = ["registry.npmjs.org"];

describe("sandbox settings", () => {
  test("T11: resolveAllowedHosts appends valid entries to the defaults and rejects a bare wildcard", () => {
    expect(resolveAllowedHosts({ MUSTER_ALLOW_HOSTS: "a.org" })).toStrictEqual([...DEFAULT_HOSTS, "a.org"]);
    expect(resolveAllowedHosts({})).toStrictEqual(DEFAULT_HOSTS);
    expect(() => resolveAllowedHosts({ MUSTER_ALLOW_HOSTS: "*" })).toThrow();
  });

  test("R1: github.com is off the defaults, because the worker can read git credentials, and MUSTER_ALLOW_HOSTS can still add it", () => {
    expect(resolveAllowedHosts({})).not.toContain("github.com");
    expect(resolveAllowedHosts({ MUSTER_ALLOW_HOSTS: "github.com" })).toStrictEqual([...DEFAULT_HOSTS, "github.com"]);
  });
});

describe("sandbox option filesystem rules", () => {
  test("R2: filesystem denies the credential stores under HOME and allows writes to the cache only; no temp roots, no denyWrite", () => {
    expect("defaultTempRoots" in sandbox).toBe(false);
    const option = sandboxOption({ env: { HOME: "/home/u" }, cache: "/r/cache" });
    expect(option.filesystem).toStrictEqual({
      denyRead: [
        "/home/u/.npmrc",
        "/home/u/.config/gh",
        "/home/u/.git-credentials",
        "/home/u/.config/git/credentials",
        "/home/u/.netrc",
        "/home/u/.aws",
        "/home/u/.docker/config.json",
        "/home/u/Library/Keychains",
        "/home/u/.ssh",
        "/home/u/.pi",
        "/home/u/.config/gcloud",
        "/home/u/.kube",
        "/home/u/.cargo/credentials.toml",
        "/home/u/.pypirc",
      ],
      allowWrite: ["/r/cache"],
    });
    expect(JSON.stringify(option)).not.toMatch(/denyWrite|tempRoots|runTmp/);
  });

  test("R3: without HOME in the env the denied paths come from the user's home directory", () => {
    const option = sandboxOption({ env: {}, cache: "/r/cache" });
    expect(option.filesystem.denyRead.every((p) => p.startsWith(homedir() + "/"))).toBe(true);
  });
});
