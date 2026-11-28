import assert from "node:assert/strict";
import { test } from "node:test";
import { createSummarizeCommand } from "./index.js";
import type { CommandContext } from "../../types/commands.js";
test("summarize validates syntax and delegates a fixed task to the shared question handler", async () => {
  const calls: CommandContext[] = [];
  const replies: string[] = [];
  const command = createSummarizeCommand(async (context) => {
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
  assert.equal(calls.length, 2);
  assert.equal(calls[0]!.requireHistory, true);
  assert.equal(calls[1]!.requireHistory, false);
  assert.equal(calls[0]!.task, "summarize");
});
