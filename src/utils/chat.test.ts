import assert from "node:assert/strict";
import test from "node:test";
import { remainingSeconds, splitForTwitch } from "./chat.js";

test("remainingSeconds rounds up and never returns less than one second", () => {
  assert.equal(remainingSeconds(2_500, 1_000), 2);
  assert.equal(remainingSeconds(1_000, 1_000), 1);
  assert.equal(remainingSeconds(500, 1_000), 1);
});

test("splitForTwitch normalizes whitespace and prefers word boundaries", () => {
  assert.deepEqual(splitForTwitch("  one   two three four ", 9), ["one two", "three", "four"]);
});

test("splitForTwitch splits long words and respects the maximum length", () => {
  const chunks = splitForTwitch("abcdefghij klm", 4);

  assert.deepEqual(chunks, ["abcd", "efgh", "ij", "klm"]);
  assert.ok(chunks.every((chunk) => chunk.length <= 4));
});

test("splitForTwitch returns no chunks for whitespace-only text", () => {
  assert.deepEqual(splitForTwitch("  \n\t  ", 10), []);
});

test("splitForTwitch rejects invalid maximum lengths", () => {
  for (const maxLength of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => splitForTwitch("message", maxLength), RangeError);
  }
});
