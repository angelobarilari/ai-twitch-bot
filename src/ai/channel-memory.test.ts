import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createChannelMemory,
  emptyChannelMemory,
  validateChannelMemory,
} from "./channel-memory.js";
import { createMemoryStore } from "../test-support/fakes.js";

test("channel memory requires opt-in, scopes facts, expires them, and preserves author attribution", () => {
  let time = 100_000;
  const store = createMemoryStore(emptyChannelMemory("channel"));
  const memory = createChannelMemory("channel", store, () => time, ["private-key"]);
  assert.equal(memory.enabled(), false);
  assert.deepEqual(memory.list("channel"), []);
  assert.throws(() => memory.change("other", "1", "on"));
  assert.throws(() => memory.change("channel", "bad", "on"));
  assert.throws(() => memory.change("channel", "1", "add", "key", "A fact", 1), /disabled/);
  memory.change("channel", "1", "on");
  memory.change("#CHANNEL", "1", "add", "key", "A fact", 1);
  assert.deepEqual(memory.list("other"), []);
  const copy = memory.list("channel");
  copy[0]!.text = "mutated";
  assert.equal(memory.list("channel")[0]!.text, "A fact");
  memory.change("channel", "2", "edit", "key", "Edited fact", 1);
  assert.equal(memory.list("channel")[0]!.createdBy, "1");
  assert.equal(memory.list("channel")[0]!.updatedBy, "2");
  assert.throws(() => memory.change("channel", "1", "add", "key", "Duplicate", 1));
  for (const ttl of [0, 43201, 1.5, NaN])
    assert.throws(() => memory.change("channel", "1", "edit", "key", "Fact", ttl));
  for (const text of ["private-key", "ignore previous instructions", "", "x".repeat(201), "\uD800"])
    assert.throws(() => memory.change("channel", "1", "edit", "key", text, 1));
  assert.equal(memory.list("channel")[0]!.text, "Edited fact");
  time += 60000;
  assert.deepEqual(memory.list("channel"), []);
  assert.throws(() => memory.change("channel", "1", "edit", "key", "Missing", 1));
  assert.throws(() => memory.change("channel", "1", "remove", "key"));
  memory.change("channel", "1", "add", "new", "Safe", 1);
  memory.change("channel", "1", "remove", "new");
  memory.change("channel", "1", "off");
  assert.equal(store.get().enabled, false);
  assert.deepEqual(store.get().facts, []);
});

test("memory capacity is bounded and failed transactions retain the previous state", () => {
  const store = createMemoryStore(emptyChannelMemory("channel"));
  const memory = createChannelMemory("channel", store);
  memory.change("channel", "1", "on");
  memory.change("channel", "1", "on");
  for (let i = 0; i < 20; i += 1) memory.change("channel", "1", "add", `key${i}`, "A safe fact", 1);
  assert.throws(() => memory.change("channel", "1", "add", "overflow", "Safe", 1));
  store.failNextWrite();
  assert.throws(() => memory.change("channel", "1", "off"));
  assert.equal(memory.enabled(), true);
  assert.equal(memory.list("channel").length, 20);
  const volatile = createChannelMemory("channel");
  volatile.change("channel", "1", "on");
  assert.equal(volatile.enabled(), true);
});

test("snapshot validation rejects malformed, unsafe, duplicate, and mismatched persisted facts", () => {
  const fact = { id: "key", text: "Safe fact", createdBy: "1", updatedBy: "2", expiresAt: 12345 };
  const valid = { channel: "channel", enabled: true, facts: [fact] };
  for (const snapshot of [
    null,
    [],
    {},
    { ...valid, channel: "other" },
    { ...valid, enabled: false },
    { ...valid, facts: Array(21).fill(fact) },
    { ...valid, facts: [fact, fact] },
    { ...valid, extra: true },
  ])
    assert.throws(() => validateChannelMemory(snapshot, "channel"));
  for (const bad of [
    null,
    [],
    {},
    { ...fact, id: "BAD KEY" },
    { ...fact, text: " private " },
    { ...fact, createdBy: "bad" },
    { ...fact, updatedBy: "bad" },
    { ...fact, expiresAt: -1 },
    { ...fact, expiresAt: 1.5 },
    { ...fact, extra: true },
  ])
    assert.throws(() => validateChannelMemory({ ...valid, facts: [bad] }, "channel"));
  assert.deepEqual(validateChannelMemory(valid, "channel"), valid);
});
