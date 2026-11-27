import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, mkdirSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAiStateStore } from "./ai-state.js";
import { createResponseLanguageStore } from "./response-language.js";
import { createObservability } from "../observability/index.js";

test("typed stores round-trip independent values with explicit path configuration", () => {
  const directory = mkdtempSync(join(tmpdir(), "phase-four-stores-"));
  const telemetry = createObservability(() => {});
  const environment = {
    AI_STATE_FILE: join(directory, "state.json"),
    AI_LANGUAGE_FILE: join(directory, "language.json"),
  };
  try {
    const state = createAiStateStore(undefined, telemetry, environment);
    const language = createResponseLanguageStore(undefined, "auto", telemetry, environment);
    state.set(false);
    language.set("Spanish");
    assert.equal(createAiStateStore(undefined, telemetry, environment).get(), false);
    assert.equal(
      createResponseLanguageStore(undefined, "auto", telemetry, environment).get(),
      "Spanish",
    );
    assert.equal(telemetry.snapshot().health.aiState, "ready");
    assert.equal(telemetry.snapshot().health.language, "ready");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("store health degrades on write failure and recovers without changing other components", () => {
  const directory = mkdtempSync(join(tmpdir(), "phase-four-store-failure-"));
  const path = join(directory, "state.json");
  const telemetry = createObservability(() => {});
  try {
    const state = createAiStateStore(path, telemetry);
    state.set(false);
    unlinkSync(path);
    mkdirSync(path);
    assert.throws(() => state.set(true), /Failed to persist/);
    assert.equal(state.get(), false);
    assert.equal(telemetry.snapshot().health.aiState, "degraded");
    assert.equal(telemetry.snapshot().health.gemini, "unknown");
    rmdirSync(path);
    state.set(true);
    assert.equal(state.get(), true);
    assert.equal(telemetry.snapshot().health.aiState, "ready");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
