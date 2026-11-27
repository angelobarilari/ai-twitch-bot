import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuestionQueue, type QueueWork } from "./question-queue.js";
import { createObservability } from "../observability/index.js";
import { createDeferred } from "../test-support/fakes.js";

test("queue enforces capacity and runs FIFO with one active worker", async () => {
  const active = createDeferred<void>();
  const order: number[] = [];
  const queue = createQuestionQueue({
    capacity: 2,
    activeTimeoutMs: 1000,
    waitingTimeoutMs: 1000,
    telemetry: createObservability(() => {}),
  });
  const first = queue.enqueue({
    run: async () => {
      order.push(1);
      await active.promise;
      return "success";
    },
    expired: async () => {},
    removed: async () => {},
    timedOut: async () => {},
  });
  const second = queue.enqueue({
    run: async () => {
      order.push(2);
      return "success";
    },
    expired: async () => {},
    removed: async () => {},
    timedOut: async () => {},
  });
  assert.ok(first && second);
  assert.equal(first.position, null);
  assert.equal(second.position, 1);
  assert.equal(
    queue.enqueue({
      run: async () => "success",
      expired: async () => {},
      removed: async () => {},
      timedOut: async () => {},
    }),
    null,
  );
  queue.dequeue();
  await Promise.resolve();
  assert.deepEqual(order, [1]);
  active.resolve();
  await Promise.all([first.completion, second.completion, queue.waitForIdle()]);
  assert.deepEqual(order, [1, 2]);
  assert.deepEqual(queue.status(), { active: false, waiting: 0 });
});

test("worker rejection settles its ticket and releases the next item", async () => {
  const queue = createQuestionQueue({
    capacity: 2,
    activeTimeoutMs: 1000,
    waitingTimeoutMs: 1000,
    telemetry: createObservability(() => {}),
  });
  const first = queue.enqueue({
    run: async () => {
      throw new Error("Expected failure");
    },
    expired: async () => {},
    removed: async () => {},
    timedOut: async () => {},
  });
  const second = queue.enqueue({
    run: async () => "success",
    expired: async () => {},
    removed: async () => {},
    timedOut: async () => {},
  });
  assert.ok(first && second);
  await assert.rejects(first.completion, /Expected failure/);
  await second.completion;
  await queue.waitForIdle();
  assert.equal(queue.status().active, false);
});

test("active timeout aborts the worker and notification failure cannot block draining", async () => {
  const lines: string[] = [];
  const telemetry = createObservability((_level, line) => lines.push(line));
  const queue = createQuestionQueue({
    capacity: 1,
    activeTimeoutMs: 5,
    waitingTimeoutMs: 1000,
    telemetry,
  });
  let signal: AbortSignal | undefined;
  const ticket = queue.enqueue({
    run: async (value) => {
      signal = value;
      return new Promise(() => {});
    },
    expired: async () => {},
    removed: async () => {},
    timedOut: async () => {
      throw new Error("private transport error");
    },
  });
  assert.ok(ticket);
  await ticket.completion;
  await queue.waitForIdle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(signal?.aborted, true);
  assert.equal(telemetry.snapshot().counters["questions.timeout"], 1);
  assert.ok(lines.some((line) => JSON.parse(line).event === "queue.notification.failed"));
  assert.ok(!lines.join("").includes("private"));
});

test("waiting expiration never invokes the provider and stop removes only waiting work", async () => {
  const active = createDeferred<void>();
  const queue = createQuestionQueue({
    capacity: 3,
    activeTimeoutMs: 1000,
    waitingTimeoutMs: 10,
    telemetry: createObservability(() => {}),
  });
  let expired = 0;
  let removed = 0;
  let runs = 0;
  const callbacks: QueueWork = {
    run: async () => {
      runs += 1;
      return "success";
    },
    expired: async () => {
      expired += 1;
    },
    removed: async () => {
      removed += 1;
    },
    timedOut: async () => {},
  };
  const first = queue.enqueue({
    ...callbacks,
    run: async () => {
      await active.promise;
      return "success";
    },
  });
  const waiting = queue.enqueue(callbacks);
  assert.ok(first && waiting);
  await waiting.completion;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(expired, 1);
  const last = queue.enqueue(callbacks);
  assert.ok(last);
  queue.stopAccepting();
  await last.completion;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removed, 1);
  assert.equal(runs, 0);
  assert.equal(queue.enqueue(callbacks), null);
  assert.deepEqual(queue.status(), { active: true, waiting: 0 });
  active.resolve();
  await first.completion;
  await queue.waitForIdle();
});
