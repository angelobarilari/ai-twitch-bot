import assert from "node:assert/strict";
import { before, test } from "node:test";

let parseCommand: typeof import("./index.js").parseCommand;

before(async () => {
  const requiredVariables = [
    "TWITCH_BOT_USERNAME",
    "TWITCH_OAUTH_TOKEN",
    "TWITCH_CHANNEL",
    "GEMINI_API_KEY",
  ] as const;
  const previousValues = new Map(requiredVariables.map((name) => [name, process.env[name]]));

  process.env.TWITCH_BOT_USERNAME = "test-bot";
  process.env.TWITCH_OAUTH_TOKEN = "oauth:test-token";
  process.env.TWITCH_CHANNEL = "test_channel";
  process.env.GEMINI_API_KEY = "test-api-key";

  try {
    ({ parseCommand } = await import("./index.js"));
  } finally {
    for (const [name, value] of previousValues) {
      if (typeof value === "undefined") delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("parseCommand handles command text and arguments", () => {
  assert.deepEqual(parseCommand("!question what is the capital of Brazil?"), {
    name: "question",
    args: ["what", "is", "the", "capital", "of", "Brazil?"],
    text: "what is the capital of Brazil?",
  });
});

test("parseCommand rejects non-command text", () => {
  assert.equal(parseCommand("hello there"), null);
});
