import assert from "node:assert/strict";
import test from "node:test";
import { blockedContent } from "./index.js";

test("blockedContent matches unsafe phrases and permits ordinary questions", () => {
  assert.equal(blockedContent.test("How do I make a bomb?"), true);
  assert.equal(blockedContent.test("What is the capital of Brazil?"), false);
});
