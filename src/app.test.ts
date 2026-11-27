import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { createApp } from "./app.js";
import { createObservability } from "./observability/index.js";
import {
  createDeferred,
  createFakeProvider,
  createFakeTwitch,
  createMemoryStore,
  createTestConfig,
} from "./test-support/fakes.js";

test("application and domain modules import without environment validation or external I/O", () => {
  const url = new URL("./app.ts", import.meta.url).href;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TWITCH_BOT_USERNAME: "",
    DOTENV_CONFIG_PATH: "unused-test-env",
  };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `globalThis.fetch = () => { throw new Error('Unexpected network'); }; await import(${JSON.stringify(url)}); console.log('imported');`,
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "imported");
});

test("two applications replace providers and stores independently without global command state", async () => {
  const firstTransport = createFakeTwitch();
  const secondTransport = createFakeTwitch();
  const firstState = createMemoryStore(true);
  const secondState = createMemoryStore(true);
  const first = createApp({
    config: createTestConfig(),
    client: firstTransport.client,
    aiState: firstState,
    language: createMemoryStore("auto"),
    provider: createFakeProvider(async () => "First provider.").provider,
    telemetry: createObservability(() => {}),
  });
  const second = createApp({
    config: createTestConfig(),
    client: secondTransport.client,
    aiState: secondState,
    language: createMemoryStore("auto"),
    provider: createFakeProvider(async () => "Second provider.").provider,
    telemetry: createObservability(() => {}),
  });
  await Promise.all([first.start(), second.start()]);
  await Promise.all([
    firstTransport.receive("test_channel", { username: "viewer" }, "!question hello", false),
    secondTransport.receive("test_channel", { username: "viewer" }, "!question hello", false),
  ]);
  assert.deepEqual(firstTransport.replies, ["First provider."]);
  assert.deepEqual(secondTransport.replies, ["Second provider."]);
  firstState.failNextWrite();
  const moderator = {
    username: "moderator",
    "user-id": "12",
    mod: true,
    badges: { moderator: "1" },
  };
  await firstTransport.receive("test_channel", moderator, "!ai off", false);
  assert.equal(firstState.get(), true);
  await firstTransport.receive("test_channel", moderator, "!ai off", false);
  assert.equal(firstState.get(), false);
  assert.equal(secondState.get(), true);
  await first.shutdown();
  assert.equal(second.telemetry.snapshot().health.twitch, "ready");
  await second.shutdown();
});

test("integration serializes provider work, clears waiting requests, and drains active work on shutdown", async () => {
  const transport = createFakeTwitch();
  const active = createDeferred<string>();
  const started = createDeferred<void>();
  const fake = createFakeProvider(async () => {
    started.resolve();
    return active.promise;
  });
  let time = 100_000;
  const app = createApp({
    config: createTestConfig(),
    client: transport.client,
    aiState: createMemoryStore(true),
    language: createMemoryStore("auto"),
    provider: fake.provider,
    telemetry: createObservability(() => {}),
    now: () => time,
  });
  await app.start();
  const first = transport.receive("test_channel", { username: "first" }, "!question first", false);
  await started.promise;
  time += 10;
  const second = transport.receive(
    "test_channel",
    { username: "second" },
    "!question second",
    false,
  );
  assert.deepEqual(app.queue.status(), { active: true, waiting: 1 });
  await app.queue.clear();
  await second;
  assert.equal(fake.calls.length, 1);
  const stopping = app.shutdown();
  assert.equal(app.queue.isAccepting(), false);
  assert.equal(transport.counts().disconnects, 0);
  active.resolve("A complete answer.");
  await Promise.all([first, stopping, app.shutdown()]);
  assert.equal(fake.maximumActive(), 1);
  assert.equal(transport.counts().disconnects, 1);
  assert.deepEqual(app.queue.status(), { active: false, waiting: 0 });
  assert.equal(app.telemetry.snapshot().health.twitch, "stopped");
});

test("failed Twitch replies do not block the next question and lifecycle errors stay observable", async () => {
  const transport = createFakeTwitch();
  let time = 100_000;
  const telemetry = createObservability(() => {});
  const app = createApp({
    config: createTestConfig(),
    client: transport.client,
    aiState: createMemoryStore(true),
    language: createMemoryStore("auto"),
    provider: createFakeProvider().provider,
    telemetry,
    now: () => time,
  });
  await app.start();
  transport.failReplies(true);
  await transport.receive("test_channel", { username: "viewer" }, "!question hello", false);
  transport.failReplies(false);
  time += 10;
  await transport.receive("test_channel", { username: "viewer" }, "!question again", false);
  assert.deepEqual(transport.replies, ["A safe answer."]);
  assert.equal(telemetry.snapshot().counters["questions.error"], 1);
  assert.equal(telemetry.snapshot().counters["questions.success"], 1);
  transport.reconnect();
  transport.disconnected();
  assert.equal(telemetry.snapshot().counters.reconnections, 1);
  transport.failDisconnect();
  await assert.rejects(app.shutdown(), /Failed to disconnect/);
  assert.equal(telemetry.snapshot().health.twitch, "degraded");
});

test("connection failure stops admission and repeated startup does not connect twice", async () => {
  const transport = createFakeTwitch();
  transport.failConnect();
  const app = createApp({
    config: createTestConfig(),
    client: transport.client,
    aiState: createMemoryStore(true),
    language: createMemoryStore("auto"),
    provider: createFakeProvider().provider,
    telemetry: createObservability(() => {}),
  });
  await assert.rejects(app.start(), /Failed to connect/);
  await assert.rejects(app.start(), /Failed to connect/);
  assert.equal(transport.counts().connects, 1);
  assert.equal(app.queue.isAccepting(), false);
  await app.shutdown();
  await assert.rejects(app.start(), /already stopped/);
});
