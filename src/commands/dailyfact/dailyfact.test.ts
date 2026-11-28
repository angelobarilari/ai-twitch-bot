import assert from "node:assert/strict";
import { test } from "node:test";
import { createDailyfactCommand } from "./index.js";
import type { CommandContext } from "../../types/commands.js";
test("dailyfact validates syntax and delegates a fixed task to the shared question handler", async () => {
  const calls: CommandContext[] = [];
  const replies: string[] = [];
  const command = createDailyfactCommand(async (context) => {
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
  assert.equal(calls.length, 1);
  assert.equal(replies[0], "Usage: !dailyfact");
  assert.equal(calls[0]!.text, "General knowledge");
  assert.equal(calls[0]!.task, "dailyfact");
});
