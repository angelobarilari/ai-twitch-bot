import assert from "node:assert/strict";
import { test } from "node:test";
import { createConversationContext } from "./context.js";

test("context isolates users, bounds turns and characters, and expires individual exchanges", () => {
  let time = 0;
  const context = createConversationContext({
    now: () => time,
    ttlMs: 10,
    maxUsers: 2,
    maxTurns: 2,
    maxCharacters: 6,
  });
  const a = context.begin("a");
  a.append("a", "b");
  time = 2;
  a.append("c", "d");
  a.append("e", "f");
  assert.deepEqual(a.read(), [
    { question: "c", answer: "d" },
    { question: "e", answer: "f" },
  ]);
  assert.deepEqual(context.begin("b").read(), []);
  const full = context.begin("c");
  full.append("x", "y");
  assert.deepEqual(full.read(), []);
  const copy = a.read();
  copy[0]!.question = "mutated";
  assert.equal(a.read()[0]!.question, "c");
  a.append("😀😀", "😀😀");
  assert.equal(a.read().length, 2);
  a.append("too many", "characters");
  assert.deepEqual(a.read(), []);
  time = 20;
  assert.deepEqual(a.read(), []);
  a.append("x", "y");
  assert.deepEqual(a.read(), []);
  const reused = context.begin("c");
  reused.append("x", "y");
  assert.equal(reused.read().length, 1);
});

test("clear invalidates active and queued sessions so late answers cannot restore deleted context", () => {
  const context = createConversationContext();
  const old = context.begin("viewer");
  old.append("hello", "world");
  context.clear("viewer");
  old.append("late", "reply");
  assert.deepEqual(old.read(), []);
  const fresh = context.begin("viewer");
  fresh.append("new", "answer");
  assert.equal(fresh.read().length, 1);
  context.clearAll();
  assert.deepEqual(fresh.read(), []);
  for (const maxTurns of [0, -1, NaN, 2 ** 32])
    assert.throws(() => createConversationContext({ maxTurns }), RangeError);
});

test("old turns expire even when later exchanges keep a session alive", () => {
  let time = 0;
  const context = createConversationContext({ now: () => time, ttlMs: 10 });
  const session = context.begin("a");
  session.append("old", "answer");
  time = 9;
  session.append("new", "answer");
  time = 11;
  assert.deepEqual(session.read(), [{ question: "new", answer: "answer" }]);
});

test("answers based on temporary facts cannot retain those facts past their original expiry", () => {
  let time = 0;
  const context = createConversationContext({ now: () => time, ttlMs: 100 });
  const session = context.begin("a");
  session.append("question", "reference-based answer", 10);
  assert.equal(session.read().length, 1);
  time = 10;
  assert.deepEqual(session.read(), []);
  const fresh = context.begin("a");
  fresh.append("late", "already expired", 9);
  assert.deepEqual(fresh.read(), []);
});
