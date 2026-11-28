import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../app.js";
import { createObservability } from "../observability/index.js";
import {
  createFakeProvider,
  createFakeTwitch,
  createMemoryStore,
  createTestConfig,
} from "../test-support/fakes.js";
import { buildGeminiBody } from "./gemini/prompt.js";

test("successful delivered turns reach the next request only for the same viewer and channel", async () => {
  let time = 100_000;
  const fake = createFakeProvider();
  const twitch = createFakeTwitch();
  const app = createApp({
    config: createTestConfig(),
    client: twitch.client,
    aiState: createMemoryStore(true),
    language: createMemoryStore("auto"),
    provider: fake.provider,
    now: () => time,
    telemetry: createObservability(() => {}),
  });
  for (const [user, channel] of [
    ["a", "channel"],
    ["a", "channel"],
    ["b", "channel"],
    ["a", "other"],
  ]) {
    await app.handleMessage(channel!, { username: user }, "!question hello", false);
    time += 10;
  }
  assert.equal(fake.calls[0]!.options!.history!.length, 0);
  assert.equal(fake.calls[1]!.options!.history!.length, 1);
  assert.equal(fake.calls[2]!.options!.history!.length, 0);
  assert.equal(fake.calls[3]!.options!.history!.length, 0);
  await app.handleMessage("channel", { username: "a" }, "!clearcontext", false);
  await app.handleMessage("channel", { username: "a" }, "!question hello", false);
  assert.equal(fake.calls[4]!.options!.history!.length, 0);
  const body = buildGeminiBody("current", "auto", 100, false, [
    { question: "prior", answer: "answer" },
  ]);
  assert.deepEqual(
    body.contents.map((entry) => entry.role),
    ["user", "model", "user"],
  );
  assert.ok(!body.systemInstruction.parts[0]!.text.includes("prior"));
  await app.shutdown();
});
