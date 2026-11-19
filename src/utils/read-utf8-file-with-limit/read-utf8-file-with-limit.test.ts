import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readUtf8FileWithLimit } from "./index.js";

test("readUtf8FileWithLimit accepts files within the byte limit", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-twitch-state-test-"));
  const filePath = join(directory, "state.json");

  try {
    writeFileSync(filePath, "12345");
    assert.equal(readUtf8FileWithLimit(filePath, 5), "12345");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("readUtf8FileWithLimit rejects invalid limits and oversized files", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-twitch-state-test-"));
  const filePath = join(directory, "state.json");

  try {
    writeFileSync(filePath, "12345");
    assert.throws(() => readUtf8FileWithLimit(filePath, 0), RangeError);
    assert.throws(() => readUtf8FileWithLimit(filePath, 4), /exceeds the 4-byte limit/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
