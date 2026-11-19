import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandContext } from "../../types/commands.js";

let statusCommand: typeof import("./index.js").statusCommand;
let setAiEnabled: typeof import("../shared/ai-state.js").setAiEnabled;
let stateDirectory: string;
let previousStateFile: string | undefined;

before(async () => {
  stateDirectory = mkdtempSync(join(tmpdir(), "ai-twitch-status-test-"));
  previousStateFile = process.env.AI_STATE_FILE;
  process.env.AI_STATE_FILE = join(stateDirectory, "ai-state.json");

  try {
    ({ statusCommand } = await import("./index.js"));
    ({ setAiEnabled } = await import("../shared/ai-state.js"));
  } finally {
    if (typeof previousStateFile === "undefined") delete process.env.AI_STATE_FILE;
    else process.env.AI_STATE_FILE = previousStateFile;
  }
});

after(() => {
  rmSync(stateDirectory, { recursive: true, force: true });
});

test("statusCommand reports enabled and disabled AI state", async () => {
  const replies: string[] = [];
  const context: CommandContext = {
    channel: "test_channel",
    tags: { username: "viewer" },
    args: [],
    text: "",
    reply: async (message) => {
      replies.push(message);
    },
  };

  setAiEnabled(true);
  await statusCommand(context);
  setAiEnabled(false);
  await statusCommand(context);

  assert.deepEqual(replies, ["The AI is enabled.", "The AI is disabled."]);
});
