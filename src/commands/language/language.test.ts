import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandContext } from "../../types/commands.js";
import { withTestEnvironment } from "../../test-support/with-test-environment.js";

let languageCommand: typeof import("./index.js").languageCommand;
let getResponseLanguage: typeof import("../../services/response-language.js").getResponseLanguage;
let stateDirectory: string;
let languageStateFile: string;

before(async () => {
  stateDirectory = mkdtempSync(join(tmpdir(), "ai-twitch-language-test-"));
  languageStateFile = join(stateDirectory, "language.json");

  await withTestEnvironment({ AI_LANGUAGE_FILE: languageStateFile }, async () => {
    ({ languageCommand } = await import("./index.js"));
    ({ getResponseLanguage } = await import("../../services/response-language.js"));
  });
});

after(() => {
  rmSync(stateDirectory, { recursive: true, force: true });
});

const createContext = (args: string[], replies: string[]): CommandContext => ({
  channel: "test_channel",
  tags: { username: "viewer" },
  args,
  text: args.join(" "),
  reply: async (message) => {
    replies.push(message);
  },
});

test("languageCommand reports and updates the channel response language", async () => {
  const replies: string[] = [];

  await languageCommand(createContext([], replies));
  await languageCommand(createContext(["Portuguese", "(Brazil)"], replies));
  await languageCommand(createContext(["AUTO"], replies));

  assert.equal(getResponseLanguage(), "auto");
  assert.deepEqual(replies, [
    "Current response language: auto. Use !language <language> or !language auto.",
    "Response language set to Portuguese (Brazil).",
    "Responses will follow the language of each question.",
  ]);
});

test("languageCommand rejects invalid values and preserves the selected language", async () => {
  const replies: string[] = [];

  await languageCommand(createContext(["x".repeat(41)], replies));

  assert.equal(getResponseLanguage(), "auto");
  assert.deepEqual(replies, [
    "Usage: !language <language> or !language auto (maximum 40 characters).",
  ]);
});

test("languageCommand reports persistence failures without changing the language", async () => {
  const previousConsoleError = console.error;
  const loggedErrors: unknown[][] = [];
  const replies: string[] = [];
  await languageCommand(createContext(["Spanish"], replies));
  rmSync(languageStateFile, { force: true });
  mkdirSync(languageStateFile);
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };

  try {
    await languageCommand(createContext(["French"], replies));
  } finally {
    console.error = previousConsoleError;
  }

  assert.equal(getResponseLanguage(), "Spanish");
  assert.equal(loggedErrors.length, 1);
  assert.equal(
    replies.at(-1),
    "Could not save the response language; the previous setting was kept.",
  );
});
