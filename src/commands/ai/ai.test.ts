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

function createContext(
  args: string[],
  tags: CommandContext["tags"],
  replies: string[],
): CommandContext {
  return {
    channel: "test_channel",
    tags,
    args,
    text: args.join(" "),
    reply: async (message) => {
      replies.push(message);
    },
  };
}

test("aiCommand lets moderators toggle the AI and reports its state", async () => {
  const replies: string[] = [];
  setAiEnabled(true);

  await aiCommand(createContext(["off"], { mod: true }, replies));
  assert.equal(isAiEnabled(), false);
  await aiCommand(createContext([], { mod: true }, replies));
  await aiCommand(createContext(["on"], { badges: { broadcaster: "1" } }, replies));
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
  await aiCommand(createContext(["toggle"], { mod: true }, replies));
  await aiCommand(createContext(["off", "on"], { mod: true }, replies));

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
  writeFileSync(malformedPath, "{");
  writeFileSync(invalidPath, JSON.stringify({ enabled: "false" }));

  assert.throws(() => createAiStateStore(malformedPath), /not valid JSON/);
  assert.throws(() => createAiStateStore(invalidPath), /must contain a boolean/);
});

test("AI state remains unchanged when persistence fails", () => {
  const filePath = join(stateDirectory, "missing-directory", "state.json");
  const store = createAiStateStore(filePath);

  assert.throws(() => store.setEnabled(false), /Failed to persist AI state/);
  assert.equal(store.isEnabled(), true);
});

test("aiCommand reports persistence failures without changing the state", async () => {
  const previousConsoleError = console.error;
  const replies: string[] = [];
  const loggedErrors: unknown[][] = [];
  rmSync(stateDirectory, { recursive: true, force: true });
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };

  try {
    await aiCommand(createContext(["off"], { mod: true }, replies));
    assert.equal(isAiEnabled(), true);
    assert.deepEqual(replies, ["Could not save the AI state; the previous setting was kept."]);
    assert.equal(loggedErrors.length, 1);
  } finally {
    console.error = previousConsoleError;
  }
});
