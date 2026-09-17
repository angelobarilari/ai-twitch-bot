import assert from "node:assert/strict";
import test from "node:test";

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const key of Object.keys(process.env)) {
    const value = snapshot[key];
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

test("loadConfig accepts valid environment values", async () => {
  const snapshot = { ...process.env };
  process.env.TWITCH_BOT_USERNAME = "bot";
  process.env.TWITCH_OAUTH_TOKEN = "oauth:token";
  process.env.TWITCH_CHANNEL = "#channel";
  process.env.GEMINI_API_KEY = "abc123";
  process.env.GEMINI_MODEL = "gemini-2.5-flash";
  process.env.COMMAND_COOLDOWN_SECONDS = "15";
  process.env.USER_COOLDOWN_SECONDS = "30";
  process.env.MAX_QUESTION_LENGTH = "300";
  process.env.MAX_ANSWER_LENGTH = "420";

  try {
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    assert.equal(config.channel, "channel");
    assert.equal(config.commandCooldownMs, 15000);
    assert.equal(config.userCooldownMs, 30000);
    assert.equal(config.maxQuestionLength, 300);
    assert.equal(config.maxAnswerLength, 420);
  } finally {
    restoreEnv(snapshot);
  }
});

test("loadConfig rejects cd "c:\Users\angel\OneDrive\Desktop\ai-twitch-bot"; npx tsx --test src/config.test.ts src/commands/index.test.ts src/services/gemini.test.ts; npm run build numeric values", async () => {
  const snapshot = { ...process.env };
  process.env.TWITCH_BOT_USERNAME = "bot";
  process.env.TWITCH_OAUTH_TOKEN = "oauth:token";
  process.env.TWITCH_CHANNEL = "#channel";
  process.env.GEMINI_API_KEY = "abc123";
  process.env.COMMAND_COOLDOWN_SECONDS = "bad";

  try {
    const { loadConfig } = await import("./config.js");
    assert.throws(() => loadConfig(), /COMMAND_COOLDOWN_SECONDS/);
  } finally {
    restoreEnv(snapshot);
  }
});
