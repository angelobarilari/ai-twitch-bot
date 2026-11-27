import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfig } from "./validate.js";

test("validator uses only supplied settings and leaves its input unchanged", () => {
  const environment = Object.freeze({
    TWITCH_BOT_USERNAME: "test_bot",
    TWITCH_OAUTH_TOKEN: "oauth:test-token",
    TWITCH_CHANNEL: "#TEST_CHANNEL",
    GEMINI_API_KEY: "test-api-key",
  });
  assert.equal(loadConfig(environment).channel, "test_channel");
  assert.equal(loadConfig(environment).language, "auto");
  assert.equal(environment.TWITCH_CHANNEL, "#TEST_CHANNEL");
  assert.throws(() => loadConfig({}), /TWITCH_BOT_USERNAME/);
});
