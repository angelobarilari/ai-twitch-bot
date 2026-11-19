import assert from "node:assert/strict";
import test from "node:test";
import { createTwitchClientOptions } from "./twitch-client-options.js";

test("createTwitchClientOptions configures a capped exponential reconnect backoff", () => {
  const options = createTwitchClientOptions({
    username: "test_bot",
    token: "oauth:test-token",
    channel: "test_channel",
  });

  assert.deepEqual(options.connection, {
    reconnect: true,
    secure: true,
    reconnectInterval: 1000,
    maxReconnectInterval: 30_000,
    reconnectDecay: 1.5,
  });
  assert.deepEqual(options.identity, { username: "test_bot", password: "oauth:test-token" });
  assert.deepEqual(options.channels, ["test_channel"]);
});
