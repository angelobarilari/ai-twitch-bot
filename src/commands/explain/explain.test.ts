import assert from "node:assert/strict";
import { test } from "node:test";
import { createExplainCommand } from "./index.js";
import type { CommandContext } from "../../types/commands.js";
test("explain validates syntax and delegates a fixed task to the shared question handler", async () => {
  const calls: CommandContext[] = [];
  const replies: string[] = [];
  const command = createExplainCommand(async (context) => {
    calls.push(context);
  });
  const base: CommandContext = {
    channel: "channel",
    tags: { username: "viewer" },
    args: [],
    text: "",
    reply: async (text) => {
      replies.push(text);
    },
  };
  await command(base);
  await command({ ...base, args: ["gravity"], text: "gravity" });
  assert.equal(replies[0], "Usage: !explain <term>");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.text, "gravity");
  assert.equal(calls[0]!.task, "explain");
});
