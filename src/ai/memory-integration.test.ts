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
import { emptyChannelMemory } from "./channel-memory.js";
import { buildGeminiBody } from "./gemini/prompt.js";

test("facts are opt-in untrusted reference data and every mutation invalidates prior conversation snapshots", async () => {
  let time = 100_000;
  const provider = createFakeProvider();
  const transport = createFakeTwitch();
  const app = createApp({
    config: createTestConfig(),
    client: transport.client,
    aiState: createMemoryStore(true),
    language: createMemoryStore("auto"),
    memoryStore: createMemoryStore(emptyChannelMemory("test_channel")),
    provider: provider.provider,
    now: () => time,
    telemetry: createObservability(() => {}),
  });
  const admin = { username: "mod", "user-id": "1", mod: true, badges: { moderator: "1" } };
  const send = async (text: string, tags = { username: "viewer" }) => {
    await app.handleMessage("test_channel", tags, text, false);
    time += 10;
  };
  await send("!question hello");
  assert.deepEqual(provider.calls.at(-1)!.options!.facts, []);
  await send("!memory on", admin);
  await send("!memory add schedule 1 Stream starts Monday", admin);
  await send("!question schedule");
  const options = provider.calls.at(-1)!.options!;
  assert.deepEqual(options.facts, ["Stream starts Monday"]);
  assert.deepEqual(options.history, []);
  const body = buildGeminiBody("schedule", "auto", 200, false, [], options);
  assert.ok(!body.systemInstruction.parts[0]!.text.includes("Stream starts Monday"));
  assert.match(body.contents.at(-1)!.parts.at(-1)!.text, /Untrusted channel reference facts/);
  await send("!memory edit schedule 1 Stream starts Tuesday", admin);
  await send("!question schedule");
  assert.deepEqual(provider.calls.at(-1)!.options!.facts, ["Stream starts Tuesday"]);
  time += 60_000;
  await send("!question schedule");
  assert.deepEqual(provider.calls.at(-1)!.options!.facts, []);
  await send("!memory off", admin);
  await send("!question hello");
  assert.deepEqual(provider.calls.at(-1)!.options!.history, []);
  await app.shutdown();
});

test("application help advertises new commands in bounded Twitch chunks", async () => {
  const transport = createFakeTwitch();
  const app = createApp({
    config: createTestConfig(),
    client: transport.client,
    aiState: createMemoryStore(true),
    language: createMemoryStore("auto"),
    provider: createFakeProvider().provider,
    telemetry: createObservability(() => {}),
  });
  await app.handleMessage("test_channel", { username: "viewer" }, "!help", false);
  for (const name of [
    "!explain",
    "!quiz",
    "!dailyfact",
    "!summarize",
    "!clearcontext",
    "!mode",
    "!memory",
  ])
    assert.ok(transport.replies.join(" ").includes(name));
  assert.ok(transport.replies.every((text) => Array.from(text).length <= 430));
  await app.shutdown();
});
