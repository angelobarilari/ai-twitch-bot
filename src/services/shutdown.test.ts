import assert from "node:assert/strict";
import test from "node:test";
import { createShutdownHandler, registerShutdownHandlers } from "./shutdown.js";

test("shutdown signal handlers stop accepting work, drain, then disconnect once", async () => {
  const previousConsoleLog = console.log;
  const calls: string[] = [];
  const listeners = new Map<NodeJS.Signals, () => void>();
  const shutdownPromises: Promise<void>[] = [];
  let resolveIdle: () => void = () => {};
  const idle = new Promise<void>((resolve) => {
    resolveIdle = resolve;
  });
  const shutdown = createShutdownHandler(
    {
      disconnect: async () => {
        calls.push("disconnect");
        return ["test", 0];
      },
    },
    {
      stopAccepting: () => {
        calls.push("stopAccepting");
      },
      waitForIdle: () => {
        calls.push("waitForIdle");
        return idle;
      },
    },
  );
  console.log = () => {};

  try {
    registerShutdownHandlers(
      (signal, listener) => {
        listeners.set(signal, listener);
      },
      (signal) => {
        const shutdownPromise = shutdown(signal);
        shutdownPromises.push(shutdownPromise);
        return shutdownPromise;
      },
    );

    assert.deepEqual([...listeners.keys()], ["SIGINT", "SIGTERM"]);
    listeners.get("SIGINT")?.();
    listeners.get("SIGTERM")?.();

    assert.deepEqual(calls, ["stopAccepting", "waitForIdle"]);
    resolveIdle();
    await Promise.all(shutdownPromises);

    assert.deepEqual(calls, ["stopAccepting", "waitForIdle", "disconnect"]);
  } finally {
    console.log = previousConsoleLog;
  }
});
