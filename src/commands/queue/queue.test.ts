import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandContext } from "../../types/commands.js";
import { withTestEnvironment } from "../../test-support/with-test-environment.js";

let queueCommand: typeof import("./index.js").queueCommand;
let stateDirectory: string;

before(async () => {
  stateDirectory = mkdtempSync(join(tmpdir(), "ai-twitch-queue-test-"));

  await withTestEnvironment({ AI_STATE_FILE: join(stateDirectory, "ai-state.json") }, async () => {
    ({ queueCommand } = await import("./index.js"));
  });
});

test("queueCommand restricts status and clearing to moderators", async () => {
  const replies: string[] = [];
  const baseContext: CommandContext = {
    channel: "test_channel",
    tags: { username: "viewer" },
    args: [],
    text: "",
    reply: async (message) => {
      replies.push(message);
    },
  };

  await queueCommand(baseContext);
  await queueCommand({
    ...baseContext,
    tags: { username: "moderator", "user-id": "42", mod: true, badges: { moderator: "1" } },
  });
  await queueCommand({
    ...baseContext,
    args: ["clear"],
    text: "clear",
    tags: { username: "test_channel", "user-id": "43", badges: { broadcaster: "1" } },
  });

  assert.deepEqual(replies, [
    "Only moderators and the broadcaster can view or clear the queue.",
    "Question queue: none in progress, 0 waiting.",
    "There are no waiting questions to remove.",
  ]);
});

test("queueCommand rejects unsupported moderator actions", async () => {
  const replies: string[] = [];
  const context: CommandContext = {
    channel: "test_channel",
    tags: { username: "moderator", "user-id": "42", mod: true, badges: { moderator: "1" } },
    args: ["status"],
    text: "status",
    reply: async (message) => {
      replies.push(message);
    },
  };

  await queueCommand(context);

  assert.deepEqual(replies, ["Usage: !queue or !queue clear."]);
});

after(() => {
  rmSync(stateDirectory, { recursive: true, force: true });
});
