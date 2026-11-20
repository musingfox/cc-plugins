import { expect, test } from "bun:test";
import { createReplyReader, foldReply } from "../src/progress";

const chunk = (text: string, messageId?: string) => ({
  sessionUpdate: "agent_message_chunk",
  ...(messageId === undefined ? {} : { messageId }),
  content: { type: "text", text },
});
const fold = (...updates: unknown[]) => updates.reduce(foldReply, null);
const textOf = (...updates: unknown[]) => fold(...updates)?.text;

test("chunks of one messageId join into one message", () => {
  expect(textOf(chunk("DONE\nchecks", "m1"), chunk(" passed", "m1"))).toBe("DONE\nchecks passed");
});

test("a later messageId replaces the earlier message, whatever came between", () => {
  const updates = [chunk("Running the checks.", "m1"), { sessionUpdate: "tool_call", toolCallId: "t1" }, chunk("DO", "m2"), chunk("NE", "m2")];
  expect(textOf(...updates)).toBe("DONE");
});

test("a messageId that resumes after other updates keeps its message", () => {
  expect(textOf(chunk("DONE\n", "m1"), { sessionUpdate: "usage_update", used: 1 }, chunk("ok", "m1"))).toBe("DONE\nok");
});

test("chunks without a messageId join until another update comes between", () => {
  expect(textOf(chunk("DO"), chunk("NE"))).toBe("DONE");
  expect(textOf(chunk("first"), { sessionUpdate: "tool_call", toolCallId: "t1" }, chunk("DONE"))).toBe("DONE");
});

test("updates that carry no agent text leave the message unchanged", () => {
  const prev = fold(chunk("DONE", "m1"));
  for (const update of [null, 7, "x", { sessionUpdate: "agent_message_chunk" }, { sessionUpdate: "agent_message_chunk", content: { type: "image", data: "x" } }, { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hmm" } }]) {
    expect(foldReply(prev, update)?.text).toBe("DONE");
  }
  expect(fold({ sessionUpdate: "plan", entries: [] })).toBeNull();
});

test("the reader hands over the turn's final message once, then starts the next turn empty", () => {
  const reader = createReplyReader();
  expect(reader.take()).toBe("");
  reader.observe({ sessionId: "s", update: chunk("Working.", "m1") });
  reader.observe({ sessionId: "s", update: chunk("DONE\nfirst", "m2") });
  expect(reader.take()).toBe("DONE\nfirst");
  expect(reader.take()).toBe("");
  reader.observe({ sessionId: "s", update: chunk("BLOCKED\nsecond", "m2") });
  expect(reader.take()).toBe("BLOCKED\nsecond");
  reader.observe("junk");
  expect(reader.take()).toBe("");
});
