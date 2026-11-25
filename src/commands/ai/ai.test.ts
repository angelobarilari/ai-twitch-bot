import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandContext } from "../../types/commands.js";

let aiCommand: typeof import("./index.js").aiCommand;
let createAiStateStore: typeof import("../shared/ai-state.js").createAiStateStore;
let isAiEnabled: typeof import("../shared/ai-state.js").isAiEnabled;
let setAiEnabled: typeof import("../shared/ai-state.js").setAiEnabled;
let stateDirectory: string;
let previousStateFile: string | undefined;

before(async () => {
  stateDirectory = mkdtempSync(join(tmpdir(), "ai-twitch-bot-test-"));
  previousStateFile = process.env.AI_STATE_FILE;
  process.env.AI_STATE_FILE = join(stateDirectory, "global-state.json");
  ({ aiCommand } = await import("./index.js"));
  ({ createAiStateStore, isAiEnabled, setAiEnabled } = await import("../shared/ai-state.js"));
});

after(() => {
  if (typeof previousStateFile === "undefined") delete process.env.AI_STATE_FILE;
  else process.env.AI_STATE_FILE = previousStateFile;
  rmSync(stateDirectory, { recursive: true, force: true });
});

const createContext = (
  args: string[],
  tags: CommandContext["tags"],
  replies: string[],
): CommandContext => {
  return {
    channel: "test_channel",
    tags,
    args,
    text: args.join(" "),
    reply: async (message) => {
      replies.push(message);
    },
  };
};

test("aiCommand lets moderators toggle the AI and reports its state", async () => {
  const replies: string[] = [];
  setAiEnabled(true);

  await aiCommand(
    createContext(
      ["off"],
      { username: "moderator", "user-id": "42", mod: true, badges: { moderator: "1" } },
      replies,
    ),
  );
  assert.equal(isAiEnabled(), false);
  await aiCommand(
    createContext(
      [],
      { username: "moderator", "user-id": "42", mod: true, badges: { moderator: "1" } },
      replies,
    ),
  );
  await aiCommand(
    createContext(
      ["on"],
      { username: "test_channel", "user-id": "43", badges: { broadcaster: "1" } },
      replies,
    ),
  );
  assert.equal(isAiEnabled(), true);

  assert.deepEqual(replies, [
    "AI disabled.",
    "The AI is currently disabled. Use !ai on or !ai off.",
    "AI enabled.",
  ]);
});

test("aiCommand rejects viewers and invalid actions", async () => {
  const replies: string[] = [];
  setAiEnabled(true);

  await aiCommand(createContext(["off"], {}, replies));
  await aiCommand(
    createContext(
      ["toggle"],
      { username: "moderator", "user-id": "42", mod: true, badges: { moderator: "1" } },
      replies,
    ),
  );
  await aiCommand(
    createContext(
      ["off", "on"],
      { username: "moderator", "user-id": "42", mod: true, badges: { moderator: "1" } },
      replies,
    ),
  );

  assert.equal(isAiEnabled(), true);
  assert.deepEqual(replies, [
    "Only moderators and the broadcaster can control the AI.",
    "Usage: !ai on or !ai off.",
    "Usage: !ai on or !ai off.",
  ]);
});

test("AI state defaults to enabled and persists changes across store instances", () => {
  const filePath = join(stateDirectory, "persistent-state.json");
  const firstStore = createAiStateStore(filePath);

  assert.equal(firstStore.isEnabled(), true);
  firstStore.setEnabled(false);

  assert.equal(readFileSync(filePath, "utf8"), '{"enabled":false}\n');
  assert.equal(createAiStateStore(filePath).isEnabled(), false);
});

test("AI state rejects malformed or invalid persisted data", () => {
  const malformedPath = join(stateDirectory, "malformed-state.json");
  const invalidPath = join(stateDirectory, "invalid-state.json");
  const oversizedPath = join(stateDirectory, "oversized-state.json");
  writeFileSync(malformedPath, "{");
  writeFileSync(invalidPath, JSON.stringify({ enabled: "false" }));
  writeFileSync(oversizedPath, "x".repeat(4097));

  assert.throws(() => createAiStateStore(malformedPath), /not valid JSON/);
  assert.throws(() => createAiStateStore(invalidPath), /must contain a boolean/);
  assert.throws(() => createAiStateStore(oversizedPath), /Failed to read persisted AI state/);
});

test("AI state migrates a valid legacy default file into the data directory", () => {
  const previousCwd = process.cwd();
  const previousFilePath = process.env.AI_STATE_FILE;
  process.chdir(stateDirectory);
  process.env.AI_STATE_FILE = ".data/ai-state.json";
  const legacyPath = join(stateDirectory, ".ai-state.json");
  const migratedPath = join(stateDirectory, ".data", "ai-state.json");
  writeFileSync(legacyPath, '{"enabled":false}\n');

  try {
    const store = createAiStateStore();
    assert.equal(store.isEnabled(), false);
    assert.equal(readFileSync(migratedPath, "utf8"), '{"enabled":false}\n');
    process.env.AI_STATE_FILE = " ";
    assert.equal(createAiStateStore().isEnabled(), false);
  } finally {
    process.chdir(previousCwd);
    if (typeof previousFilePath === "undefined") delete process.env.AI_STATE_FILE;
    else process.env.AI_STATE_FILE = previousFilePath;
  }
});

test("AI state remains unchanged when persistence fails", () => {
  const blockingPath = join(stateDirectory, "not-a-directory");
  const filePath = join(blockingPath, "state.json");
  const store = createAiStateStore(filePath);
  writeFileSync(blockingPath, "file");

  assert.throws(() => store.setEnabled(false), /Failed to persist AI state/);
  assert.equal(store.isEnabled(), true);
});

test("aiCommand reports persistence failures without changing the state", async () => {
  const previousConsoleError = console.error;
  const replies: string[] = [];
  const loggedErrors: unknown[][] = [];
  rmSync(stateDirectory, { recursive: true, force: true });
  writeFileSync(stateDirectory, "not a directory");
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };

  try {
    await aiCommand(
      createContext(
        ["off"],
        { username: "moderator", "user-id": "42", mod: true, badges: { moderator: "1" } },
        replies,
      ),
    );
    assert.equal(isAiEnabled(), true);
    assert.deepEqual(replies, ["Could not save the AI state; the previous setting was kept."]);
    assert.equal(loggedErrors.length, 1);
  } finally {
    console.error = previousConsoleError;
  }
});

test("corrupted AI state errors do not expose persisted content through their cause", () => {
  const directory = mkdtempSync(join(tmpdir(), "ai-state-privacy-"));
  try {
    const path = join(directory, "state.json");
    writeFileSync(path, "PRIVATE_PAYLOAD is not JSON");
    assert.throws(
      () => createAiStateStore(path),
      (error: unknown) =>
        error instanceof Error && error.cause === undefined && /not valid JSON/.test(error.message),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
