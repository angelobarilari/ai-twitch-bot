import assert from "node:assert/strict";
import test from "node:test";
import { normalizeChatText } from "./index.js";

test("normalizes compatibility forms and whitespace without breaking emoji", () => {
  assert.equal(normalizeChatText("  Ｈｅｌｌｏ\n😀  "), "Hello 😀");
  assert.equal(normalizeChatText("cafe\u0301"), "café");
});

test("rejects malformed Unicode, invisible text, and control characters", () => {
  for (const value of ["\uD800", "\uDC00", "ig\u200Bnore", "a\u0000b", "a\u202Eb"]) {
    assert.equal(normalizeChatText(value), null);
  }
});
