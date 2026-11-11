import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { CommandContext } from "../types/commands.js";

let helpCommand: typeof import("./help.js").helpCommand;
let config: typeof import("../config.js").config;

before(async () => {
  const requiredVariables = [
    "TWITCH_BOT_USERNAME",
    "TWITCH_OAUTH_TOKEN",
    "TWITCH_CHANNEL",
    "GEMINI_API_KEY",
    "COMMAND_COOLDOWN_SECONDS",
    "USER_COOLDOWN_SECONDS",
    "MAX_QUESTION_LENGTH",
    "MAX_PENDING_QUESTIONS",
  ] as const;
  const previousValues = new Map(requiredVariables.map((name) => [name, process.env[name]]));

  process.env.TWITCH_BOT_USERNAME = "test-bot";
  process.env.TWITCH_OAUTH_TOKEN = "oauth:test-token";
  process.env.TWITCH_CHANNEL = "test_channel";
  process.env.GEMINI_API_KEY = "test-api-key";
  process.env.COMMAND_COOLDOWN_SECONDS = "12";
  process.env.USER_COOLDOWN_SECONDS = "24";
  process.env.MAX_QUESTION_LENGTH = "250";
  process.env.MAX_PENDING_QUESTIONS = "4";

  try {
    ({ helpCommand } = await import("./help.js"));
    ({ config } = await import("../config.js"));
  } finally {
    for (const [name, value] of previousValues) {
      if (typeof value === "undefined") delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("helpCommand lists commands, permissions, and configured limits", async () => {
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

  await helpCommand(context);

  assert.deepEqual(replies, [
    `!help command list; !about bot info; !ping connection; !status AI status; !language <language|auto> channel language; !question <question> max ${config.maxQuestionLength} characters; !ai [on|off] and !queue [clear] (moderators). Cooldown: ${config.commandCooldownMs / 1000}s global/${config.userCooldownMs / 1000}s per user; queue max ${config.maxPendingQuestions}.`,
  ]);
  assert.ok(replies[0] && replies[0].length <= 500);
});
