import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readReport, writeTurnReport } from "../src/report";

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

describe("writeTurnReport", () => {
  function inDir(fn: (path: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), "muster-report-"));
    try {
      fn(join(dir, "REPORT.md"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("W1: the final message becomes the report and its first line decides done or malformed", () => {
    inDir((p) => {
      writeTurnReport(p, "DONE\nchecks passed");
      expect(readFileSync(p, "utf8")).toBe("DONE\nchecks passed");
      expect(readReport(p)).toEqual({ kind: "done", body: "checks passed" });
      writeTurnReport(p, "HTTP 404 Not Found\nDONE");
      expect(readReport(p)).toEqual({ kind: "malformed", firstLine: "HTTP 404 Not Found" });
    });
  });

  test("W2: C0 controls other than newline and tab, ESC, DEL and C1 controls are stripped", () => {
    inDir((p) => {
      writeTurnReport(p, "DONE\r\n\u001b[31mred\u001b[0m\tok\u0007\u0000\u007f\u009b2J\u0085end\u00a0x");
      expect(readFileSync(p, "utf8")).toBe("DONE\n[31mred[0m\tok2Jend\u00a0x");
    });
  });

  test("W3: a later turn's message replaces the report and leaves no other file", () => {
    inDir((p) => {
      writeTurnReport(p, "DONE\nfirst");
      writeTurnReport(p, "BLOCKED\nsecond");
      expect(readFileSync(p, "utf8")).toBe("BLOCKED\nsecond");
      expect(readdirSync(dirname(p))).toEqual(["REPORT.md"]);
    });
  });

  test("W4: a turn that ended without any agent text leaves no report, removing the previous one", () => {
    inDir((p) => {
      writeTurnReport(p, "DONE\nfirst");
      writeTurnReport(p, "");
      expect(existsSync(p)).toBe(false);
      writeTurnReport(p, "\u001b\u0007");
      expect(readReport(p)).toEqual({ kind: "none" });
    });
  });
});
