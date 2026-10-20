import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readReport } from "../src/report";

function withReport(content: string, fn: (path: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "muster-report-"));
  try {
    const path = join(dir, "report.md");
    writeFileSync(path, content);
    fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("readReport", () => {
  test("T1: DONE and BLOCKED first lines parse with the body after the first line", () => {
    withReport("DONE\nall good", (p) => {
      expect(readReport(p)).toEqual({ kind: "done", body: "all good" });
    });
    withReport("BLOCKED\nneed key", (p) => {
      expect(readReport(p)).toEqual({ kind: "blocked", body: "need key" });
    });
  });

  test("T2: anything other than the exact first line is malformed", () => {
    const cases = ["DONE: x", "Status: DONE", "\nDONE", "", "﻿DONE\nok"];
    for (const content of cases) {
      withReport(content, (p) => {
        expect(readReport(p).kind).toBe("malformed");
      });
    }
  });

  test("T3: trailing CR and spaces on the first line are ignored", () => {
    withReport("DONE\r\nok", (p) => {
      expect(readReport(p)).toEqual({ kind: "done", body: "ok" });
    });
    withReport("DONE  \nok", (p) => {
      expect(readReport(p)).toEqual({ kind: "done", body: "ok" });
    });
  });

  test("T4: a missing file returns none", () => {
    const dir = mkdtempSync(join(tmpdir(), "muster-report-"));
    try {
      expect(readReport(join(dir, "absent.md"))).toEqual({ kind: "none" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("T5: a path that is a directory returns malformed without throwing", () => {
    const dir = mkdtempSync(join(tmpdir(), "muster-report-"));
    try {
      const asDir = join(dir, "is-a-dir");
      mkdirSync(asDir);
      expect(() => readReport(asDir)).not.toThrow();
      expect(readReport(asDir).kind).toBe("malformed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("T6: readReport takes one parameter, so no stopReason can reach it", () => {
    expect(readReport.length).toBe(1);
  });
});
