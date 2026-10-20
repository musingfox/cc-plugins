import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, linkSync, readFileSync, statSync, writeFileSync, mkdirSync, appendFileSync, truncateSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cloneDirectory, makeCloneDirectory } from "../src/clonefile";
import { mkdirOutsideTemp, removeFixtures } from "./support/repo";

afterAll(removeFixtures);

function sourceTree(): { root: string; src: string } {
  const root = mkdirOutsideTemp("muster-clone-");
  const src = join(root, "nm");
  mkdirSync(join(src, "pkg"), { recursive: true });
  writeFileSync(join(src, "pkg", "a.bin"), "original-a\n");
  linkSync(join(src, "pkg", "a.bin"), join(src, "pkg", "b.bin"));
  writeFileSync(join(src, "pkg", "c.txt"), "c\n");
  return { root, src };
}

describe("cloneDirectory", () => {
  test("T1: clones the tree so hardlinked files become independent inodes", () => {
    const { root, src } = sourceTree();
    const dst = join(root, "dst");

    expect(cloneDirectory(src, dst)).toEqual({ ok: true });

    const a = statSync(join(dst, "pkg", "a.bin"));
    const b = statSync(join(dst, "pkg", "b.bin"));
    expect(a.ino).not.toBe(b.ino);
    expect(a.nlink).toBe(1);
    expect(b.nlink).toBe(1);
  });

  test("T2: writes in the clone do not reach the source", () => {
    const { root, src } = sourceTree();
    const dst = join(root, "dst");
    cloneDirectory(src, dst);

    appendFileSync(join(dst, "pkg", "a.bin"), "extra\n");
    truncateSync(join(dst, "pkg", "b.bin"), 0);
    rmSync(join(dst, "pkg", "c.txt"));

    expect(readFileSync(join(src, "pkg", "a.bin"), "utf8")).toBe("original-a\n");
    expect(readFileSync(join(src, "pkg", "b.bin"), "utf8")).toBe("original-a\n");
    expect(statSync(join(src, "pkg", "a.bin")).nlink).toBe(2);
    expect(statSync(join(src, "pkg", "b.bin")).nlink).toBe(2);
    expect(existsSync(join(src, "pkg", "c.txt"))).toBe(true);
  });

  test("T3: refuses an existing destination and leaves its content untouched", () => {
    const { root, src } = sourceTree();
    const dst = join(root, "dst");
    mkdirSync(dst);
    writeFileSync(join(dst, "keep.txt"), "keep\n");

    expect(cloneDirectory(src, dst)).toEqual({ ok: false, detail: "errno=17" });
    expect(readFileSync(join(dst, "keep.txt"), "utf8")).toBe("keep\n");
  });

  test("T4: a missing source reports errno=2 and creates no destination", () => {
    const root = mkdirOutsideTemp("muster-clone-");
    const dst = join(root, "dst");

    expect(cloneDirectory(join(root, "absent"), dst)).toEqual({ ok: false, detail: "errno=2" });
    expect(existsSync(dst)).toBe(false);
  });

  test("T5: a library load failure is returned verbatim, without throwing", () => {
    const clone = makeCloneDirectory(() => {
      throw new Error("Failed to open library 'x'");
    });

    expect(clone("/a", "/b")).toEqual({ ok: false, detail: "Failed to open library 'x'" });
  });

  test("T6: a clonefile failure reports the errno it left behind", () => {
    const clone = makeCloneDirectory(() => ({
      clonefile: () => -1,
      errno: () => 18,
    }));

    expect(clone("/a", "/b")).toEqual({ ok: false, detail: "errno=18" });
  });

  test("T7: a failed clone removes the partial destination it created", () => {
    const root = mkdirOutsideTemp("muster-clone-");
    const dst = join(root, "dst");
    const clone = makeCloneDirectory(() => ({
      clonefile: (_src, to) => {
        mkdirSync(to);
        writeFileSync(join(to, "half.txt"), "half\n");
        return -1;
      },
      errno: () => 28,
    }));

    expect(clone("/a", dst)).toEqual({ ok: false, detail: "errno=28" });
    expect(existsSync(dst)).toBe(false);
  });

  test("T8: a failed clone leaves a destination that existed before the call untouched", () => {
    const root = mkdirOutsideTemp("muster-clone-");
    const dst = join(root, "dst");
    mkdirSync(dst);
    writeFileSync(join(dst, "keep.txt"), "keep\n");
    const clone = makeCloneDirectory(() => ({ clonefile: () => -1, errno: () => 17 }));

    expect(clone("/a", dst)).toEqual({ ok: false, detail: "errno=17" });
    expect(readFileSync(join(dst, "keep.txt"), "utf8")).toBe("keep\n");
  });
});
