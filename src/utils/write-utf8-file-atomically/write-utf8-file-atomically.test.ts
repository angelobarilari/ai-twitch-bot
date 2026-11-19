import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeUtf8FileAtomically } from "./index.js";

test("writeUtf8FileAtomically creates directories and replaces files without temporary leftovers", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-twitch-state-test-"));
  const filePath = join(directory, "nested", "state.json");

  try {
    writeUtf8FileAtomically(filePath, '{"enabled":true}\n');
    writeUtf8FileAtomically(filePath, '{"enabled":false}\n');

    assert.equal(readFileSync(filePath, "utf8"), '{"enabled":false}\n');
    assert.deepEqual(readdirSync(join(directory, "nested")), ["state.json"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("writeUtf8FileAtomically preserves the previous destination when replacement fails", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-twitch-state-test-"));
  const filePath = join(directory, "state.json");
  mkdirSync(filePath);

  try {
    assert.throws(() => writeUtf8FileAtomically(filePath, '{"enabled":false}\n'));
    assert.equal(statSync(filePath).isDirectory(), true);
    assert.deepEqual(readdirSync(directory), ["state.json"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("writeUtf8FileAtomically removes partial temporary data after a write interruption", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-twitch-state-test-"));
  const filePath = join(directory, "state.json");
  const previousState = '{"enabled":true}\n';
  writeUtf8FileAtomically(filePath, previousState);

  const interruptAfterPartialWrite = (descriptor: number, contents: string): void => {
    writeFileSync(descriptor, contents.slice(0, 5), "utf8");
    throw new Error("Simulated interruption during temporary-file writing.");
  };

  try {
    assert.throws(
      () => writeUtf8FileAtomically(filePath, '{"enabled":false}\n', interruptAfterPartialWrite),
      /Simulated interruption/,
    );
    assert.equal(readFileSync(filePath, "utf8"), previousState);
    assert.deepEqual(readdirSync(directory), ["state.json"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
