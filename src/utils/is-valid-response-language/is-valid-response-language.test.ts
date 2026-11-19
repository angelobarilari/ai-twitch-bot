import assert from "node:assert/strict";
import test from "node:test";
import { isValidResponseLanguage } from "./index.js";

test("isValidResponseLanguage accepts language names and auto", () => {
  assert.equal(isValidResponseLanguage("English"), true);
  assert.equal(isValidResponseLanguage("Portuguese (Brazil)"), true);
  assert.equal(isValidResponseLanguage(" AUTO "), true);
});

test("isValidResponseLanguage rejects empty, overlong, and malformed names", () => {
  assert.equal(isValidResponseLanguage(" "), false);
  assert.equal(isValidResponseLanguage("x".repeat(41)), false);
  assert.equal(isValidResponseLanguage("English!"), false);
});
