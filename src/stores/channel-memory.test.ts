import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChannelMemoryStore } from "./channel-memory.js";
import { createChannelMemory } from "../ai/channel-memory.js";

test("channel memory persists opt-in atomically, validates reloads, and preserves state on failed writes", () => {
  const dir = mkdtempSync(join(tmpdir(), "channel-memory-"));
  const file = join(dir, "facts.json");
  try {
    const store = createChannelMemoryStore(file, "channel");
    const memory = createChannelMemory("channel", store);
    memory.change("channel", "1", "on");
    memory.change("channel", "1", "add", "key", "Safe fact", 1);
    assert.equal(
      createChannelMemory("channel", createChannelMemoryStore(file, "channel")).list("channel")
        .length,
      1,
    );
    assert.throws(() => createChannelMemoryStore(file, "other"));
    unlinkSync(file);
    mkdirSync(file);
    assert.throws(() => store.set({ channel: "channel", enabled: false, facts: [] }));
    assert.equal(store.get().enabled, true);
    assert.throws(() => createChannelMemoryStore(file, "channel"));
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "private-invalid-json");
    assert.throws(
      () => createChannelMemoryStore(bad, "channel"),
      (error: unknown) => error instanceof Error && !error.message.includes("private"),
    );
    writeFileSync(bad, "x".repeat(32769));
    assert.throws(() => createChannelMemoryStore(bad, "channel"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
