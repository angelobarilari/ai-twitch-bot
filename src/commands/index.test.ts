import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand } from "./index.js";

test("parseCommand handles command text and arguments", () => {
  assert.deepEqual(parseCommand("!question what is the capital of Brazil?"), {
    name: "question",
    args: ["what", "is", "the", "capital", "of", "Brazil?"],
    text: "what is the capital of Brazil?",
  });
});

test("parseCommand rejects non-command text", () => {
  assert.equal(parseCommand("hello there"), null);
});
