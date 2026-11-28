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

test("mode budgets reach providers, trigger concise retry, and are enforced before chat delivery", async () => {
  let time = 100_000;
  const provider = createFakeProvider(async (_question, options) =>
    options?.concise ? "a short answer" : "a".repeat(300),
  );
  const twitch = createFakeTwitch();
  const app = createApp({
    config: createTestConfig(),
    client: twitch.client,
    aiState: createMemoryStore(true),
    language: createMemoryStore("auto"),
    provider: provider.provider,
    now: () => time,
    telemetry: createObservability(() => {}),
    persona: "tutor",
  });
  await app.handleMessage("channel", { username: "viewer" }, "!question hello", false);
  assert.equal(provider.calls.length, 2);
  assert.equal(provider.calls[0]!.options!.maxAnswerLength, 210);
  assert.equal(provider.calls[0]!.options!.persona, "tutor");
  assert.equal(twitch.replies[0], "a short answer");
  const moderator = { username: "mod", "user-id": "1", mod: true, badges: { moderator: "1" } };
  await app.handleMessage("channel", moderator, "!mode detailed", false);
  time += 10;
  await app.handleMessage("channel", { username: "viewer" }, "!question again", false);
  assert.equal(provider.calls.at(-1)!.options!.mode, "detailed");
  assert.equal(provider.calls.at(-1)!.options!.maxAnswerLength, 420);
  assert.equal(twitch.replies.at(-1)!.length, 300);
  await app.shutdown();
});
