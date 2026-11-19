import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let createResponseLanguageStore: typeof import("./response-language.js").createResponseLanguageStore;
let testDirectory: string;
let previousCwd: string;
let previousEnvironment: Map<string, string | undefined>;

const environmentDefaults: Record<string, string> = {
  TWITCH_BOT_USERNAME: "test_bot",
  TWITCH_OAUTH_TOKEN: "oauth:test-token",
  TWITCH_CHANNEL: "test_channel",
  GEMINI_API_KEY: "test-key",
  GEMINI_TIMEOUT_MS: "10000",
  GEMINI_MAX_RETRIES: "1",
  GEMINI_RETRY_BASE_DELAY_MS: "250",
  QUESTION_TIMEOUT_MS: "45000",
  QUESTION_QUEUE_TIMEOUT_MS: "120000",
  GEMINI_MODEL: "gemini-2.5-flash",
  GEMINI_LANGUAGE: "auto",
  COMMAND_COOLDOWN_SECONDS: "15",
  USER_COOLDOWN_SECONDS: "30",
  MAX_QUESTION_LENGTH: "300",
  MAX_ANSWER_LENGTH: "420",
  MAX_PENDING_QUESTIONS: "5",
};

before(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "ai-twitch-language-test-"));
  previousCwd = process.cwd();
  previousEnvironment = new Map(
    Object.keys(environmentDefaults)
      .concat(["AI_LANGUAGE_FILE"])
      .map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, environmentDefaults);
  process.env.AI_LANGUAGE_FILE = join(testDirectory, "global-language.json");
  ({ createResponseLanguageStore } = await import("./response-language.js"));
});

after(() => {
  process.chdir(previousCwd);
  for (const [name, value] of previousEnvironment) {
    if (typeof value === "undefined") delete process.env[name];
    else process.env[name] = value;
  }
  rmSync(testDirectory, { recursive: true, force: true });
});

test("response language is atomically persisted and loaded by another store", () => {
  const filePath = join(testDirectory, "nested", "language.json");
  const store = createResponseLanguageStore(filePath, "auto");

  store.set("Portuguese (Brazil)");

  assert.equal(readFileSync(filePath, "utf8"), '{"language":"Portuguese (Brazil)"}\n');
  assert.equal(createResponseLanguageStore(filePath, "auto").get(), "Portuguese (Brazil)");
});

test("response language rejects malformed and oversized state files", () => {
  const malformedPath = join(testDirectory, "malformed-language.json");
  const oversizedPath = join(testDirectory, "oversized-language.json");
  writeFileSync(malformedPath, "{");
  writeFileSync(oversizedPath, "x".repeat(4097));

  assert.throws(() => createResponseLanguageStore(malformedPath), /not valid JSON/);
  assert.throws(
    () => createResponseLanguageStore(oversizedPath),
    /Failed to read response language/,
  );
});

test("response language migrates the legacy default file into the data directory", () => {
  const originalLanguageFile = process.env.AI_LANGUAGE_FILE;
  process.chdir(testDirectory);
  process.env.AI_LANGUAGE_FILE = ".data/ai-language.json";
  const legacyPath = join(testDirectory, ".ai-language.json");
  const migratedPath = join(testDirectory, ".data", "ai-language.json");
  writeFileSync(legacyPath, '{"language":"Spanish"}\n');

  try {
    const store = createResponseLanguageStore();
    assert.equal(store.get(), "Spanish");
    assert.equal(readFileSync(migratedPath, "utf8"), '{"language":"Spanish"}\n');
    process.env.AI_LANGUAGE_FILE = " ";
    assert.equal(createResponseLanguageStore().get(), "Spanish");
  } finally {
    process.chdir(previousCwd);
    if (typeof originalLanguageFile === "undefined") delete process.env.AI_LANGUAGE_FILE;
    else process.env.AI_LANGUAGE_FILE = originalLanguageFile;
  }
});
