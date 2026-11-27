import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("discovery includes new nested tests and excludes build, dependencies, and unrelated files", async () => {
  const moduleUrl = new URL("../../scripts/run-tests.mjs", import.meta.url).href;
  const { discoverTests } = await import(moduleUrl);
  const root = mkdtempSync(join(tmpdir(), "test-discovery-"));
  try {
    for (const directory of ["nested/deep", "dist", "node_modules"])
      mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, "first.test.ts"), "");
    writeFileSync(join(root, "nested/deep/second.test.ts"), "");
    writeFileSync(join(root, "dist/ignored.test.ts"), "");
    writeFileSync(join(root, "node_modules/ignored.test.ts"), "");
    writeFileSync(join(root, "not-a-test.ts"), "");
    assert.equal(discoverTests(root).length, 2);
    writeFileSync(join(root, "nested/new.test.ts"), "");
    assert.equal(discoverTests(root).length, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runner executes TypeScript files and propagates failures with nonzero exit status", () => {
  const root = mkdtempSync(join(tmpdir(), "test-runner-"));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "src"));
  const runner = join(root, "scripts/run-tests.mjs");
  copyFileSync(new URL("../../scripts/run-tests.mjs", import.meta.url), runner);
  const file = join(root, "src/example.test.ts");
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  try {
    writeFileSync(
      file,
      'import { test } from "node:test"; const value: number = 1; test("fixture", () => { if (value !== 1) throw new Error("bad"); });',
    );
    const success = spawnSync(process.execPath, [runner, file], { encoding: "utf8", env });
    assert.equal(success.status, 0, success.stderr + success.stdout);
    writeFileSync(
      file,
      'import { test } from "node:test"; test("fixture fails", () => { throw new Error("expected failure"); });',
    );
    const failure = spawnSync(process.execPath, [runner, file], { encoding: "utf8", env });
    assert.equal(failure.status, 1, failure.stderr + failure.stdout);
    assert.match(failure.stdout, /fixture fails/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("watch rediscovers newly added nested tests", { timeout: 15_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "test-watch-"));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "src"));
  copyFileSync(
    new URL("../../scripts/run-tests.mjs", import.meta.url),
    join(root, "scripts/run-tests.mjs"),
  );
  writeFileSync(join(root, "package.json"), '{"type":"module"}');
  writeFileSync(
    join(root, "src/first.test.ts"),
    'import { test } from "node:test"; test("initial fixture", () => {});',
  );
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, [join(root, "scripts/run-tests.mjs"), "--watch"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });
  try {
    for (let count = 0; count < 100 && !output.includes("ok 1 - initial fixture"); count += 1)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.match(output, /ok 1 - initial fixture/);
    mkdirSync(join(root, "src/nested"));
    writeFileSync(
      join(root, "src/nested/new.test.ts"),
      'import { test } from "node:test"; test("newly discovered fixture", () => {});',
    );
    for (let count = 0; count < 100 && !output.includes("newly discovered fixture"); count += 1)
      await new Promise((resolve) => setTimeout(resolve, 50));
    assert.match(output, /ok \d+ - newly discovered fixture/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill("SIGTERM");
      await exited;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
