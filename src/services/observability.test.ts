import assert from "node:assert/strict";
import { test } from "node:test";
import { createObservability, observability, startHealthReporting } from "./observability.js";

test("JSON logs reject content and arbitrary metadata, including secrets in permitted string fields", () => {
  const lines: string[] = [];
  const telemetry = createObservability((_level, line) => lines.push(line));
  const untrusted = {
    outcome: "private-question",
    command: "oauth:secret",
    question: "private-question",
    answer: "private-answer",
    error: new Error("secret"),
    status: NaN,
    durationMs: 12,
    queueWaiting: 2,
  };
  telemetry.log("warn", "question.completed", untrusted);
  telemetry.log("error", "private-event", untrusted);
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]!);
  assert.equal(record.level, "warn");
  assert.equal(record.event, "question.completed");
  assert.equal(record.durationMs, 12);
  assert.equal(record.queueWaiting, 2);
  assert.ok(!lines[0]!.includes("private"));
  assert.ok(!lines[0]!.includes("secret"));
  assert.equal(record.status, undefined);
  assert.ok(!Number.isNaN(Date.parse(record.timestamp)));
});

test("metrics aggregate measurements and snapshots cannot mutate internal counters or health", () => {
  const telemetry = createObservability(() => {});
  telemetry.increment("messages.received");
  telemetry.increment("messages.received");
  telemetry.observe("answers.characters", 10);
  telemetry.observe("answers.characters", 20);
  telemetry.observe("answers.characters", -1);
  telemetry.setHealth("gemini", "degraded");
  telemetry.setHealth("aiState", "ready");
  const snapshot = telemetry.snapshot();
  assert.equal(snapshot.counters["messages.received"], 2);
  assert.deepEqual(snapshot.aggregates["answers.characters"], {
    count: 2,
    total: 30,
    max: 20,
    mean: 15,
  });
  assert.equal(snapshot.health.gemini, "degraded");
  assert.equal(snapshot.health.aiState, "ready");
  snapshot.health.gemini = "ready";
  snapshot.counters["messages.received"] = 50;
  assert.equal(telemetry.snapshot().health.gemini, "degraded");
  assert.equal(telemetry.snapshot().counters["messages.received"], 2);
});

test("Twitch transitions suppress repeated disconnect/reconnect messages", () => {
  const lines: string[] = [];
  const telemetry = createObservability((_level, line) => lines.push(line));
  telemetry.setHealth("twitch", "ready");
  telemetry.setHealth("twitch", "degraded");
  telemetry.setHealth("twitch", "degraded");
  telemetry.setHealth("twitch", "ready");
  assert.equal(lines.length, 3);
  assert.equal(telemetry.snapshot().counters.reconnections, 1);
});

test("periodic health includes independent components and live queue and stops on cleanup", async () => {
  const previous = console.info;
  const lines: string[] = [];
  console.info = (line) => lines.push(String(line));
  observability.setHealth("gemini", "degraded");
  observability.setHealth("aiState", "ready");
  const stop = startHealthReporting(
    () => ({ active: true, waiting: 2 }),
    () => false,
    5,
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 25));
    stop();
    assert.ok(lines.length > 0);
    const record = JSON.parse(lines[0]!);
    assert.equal(record.event, "process.health");
    assert.equal(record.health.gemini, "degraded");
    assert.equal(record.health.aiState, "ready");
    assert.deepEqual(record.queue, { active: true, waiting: 2 });
    assert.equal(record.enabled, false);
    const count = lines.length;
    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal(lines.length, count);
  } finally {
    stop();
    console.info = previous;
  }
});
