import assert from "node:assert/strict";
import test from "node:test";
import type { CommandContext } from "../../types/commands.js";
import { aboutCommand } from "./index.js";

test("aboutCommand explains the bot and points viewers to help", async () => {
  const replies: string[] = [];
  const context: CommandContext = {
    channel: "test_channel",
    tags: {},
    args: [],
    text: "",
    reply: async (message) => {
      replies.push(message);
    },
  };

  await aboutCommand(context);

  assert.deepEqual(replies, [
    "I am an AI chat bot for Twitch. I use Gemini to answer questions briefly; use !help to see the available commands.",
  ]);
});
