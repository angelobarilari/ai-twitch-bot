import assert from "node:assert/strict";
import test from "node:test";
import { remainingSeconds } from "./index.js";

test("remainingSeconds rounds up and never returns less than one second", () => {
  assert.equal(remainingSeconds(2_500, 1_000), 2);
  assert.equal(remainingSeconds(1_000, 1_000), 1);
  assert.equal(remainingSeconds(500, 1_000), 1);
});
