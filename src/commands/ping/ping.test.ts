import assert from "node:assert/strict";
import test from "node:test";
import type { CommandContext } from "../../types/commands.js";
import { pingCommand } from "./index.js";

test("pingCommand replies with the bot status", async () => {
  const replies: string[] = [];
  const context: CommandContext = {
    channel: "test_channel",
    tags: { username: "viewer" },
    args: [],
    text: "",
    reply: async (message) => {
      replies.push(message);
    },
  };

  await pingCommand(context);

  assert.deepEqual(replies, ["Pong! Bot is online."]);
});
