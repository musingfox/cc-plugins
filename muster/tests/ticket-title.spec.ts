import { expect, test } from "bun:test";
import { ticketTitle } from "../src/progress";

test("the title is the first line without leading hashes", () => {
  expect(ticketTitle("# Add login form\nDetails")).toBe("Add login form");
});

test("leading blank lines, spaces and CRLF are dropped and inner spacing kept", () => {
  expect(ticketTitle("\n\n  ## Fix  the bug \r\nmore")).toBe("Fix  the bug");
});

test("a line that is only hashes is skipped", () => {
  expect(ticketTitle("#\n###\nReal line")).toBe("Real line");
});

test("a ticket with no usable line gives an empty title", () => {
  expect(ticketTitle("   \n\n")).toBe("");
});

test("the title is cut to its first 200 characters", () => {
  expect(ticketTitle("x".repeat(500))).toBe("x".repeat(200));
});
