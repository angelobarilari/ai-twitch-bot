import assert from "node:assert/strict";
import { test } from "node:test";
import { createObservability, startHealthReporting } from "./index.js";

test("periodic health uses the injected logger and instance health", async () => {
  const lines: string[] = [];
  const telemetry = createObservability((_level, line) => lines.push(line));
  telemetry.setHealth("language", "ready");
  const stop = startHealthReporting(
    () => ({ active: false, waiting: 0 }),
    () => true,
    5,
    telemetry,
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 25));
    stop();
    assert.ok(lines.length > 0);
    const record = JSON.parse(lines[0]!);
    assert.equal(record.event, "process.health");
    assert.equal(record.health.language, "ready");
    assert.equal(record.health.gemini, "unknown");
    assert.deepEqual(record.queue, { active: false, waiting: 0 });
  } finally {
    stop();
  }
});
