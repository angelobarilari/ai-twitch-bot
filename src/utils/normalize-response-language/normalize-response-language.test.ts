import assert from "node:assert/strict";
import test from "node:test";
import { normalizeResponseLanguage } from "./index.js";

test("normalizeResponseLanguage trims names and canonicalizes auto", () => {
  assert.equal(normalizeResponseLanguage(" Portuguese (Brazil) "), "Portuguese (Brazil)");
  assert.equal(normalizeResponseLanguage(" AUTO "), "auto");
});
