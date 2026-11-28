import assert from "node:assert/strict";
import { test } from "node:test";
import { createModeCommand } from "./index.js";
import { createMemoryStore } from "../../test-support/fakes.js";
import { createObservability } from "../../observability/index.js";
import type { ResponseMode } from "../../ai/profiles.js";

test("viewers query mode but only consistent moderator identities can change fixed profiles", async () => {
  const store = createMemoryStore<ResponseMode>("concise");
  const lines: string[] = [];
  const replies: string[] = [];
  const command = createModeCommand(
    store,
    createObservability((_level, text) => lines.push(text)),
  );
  const context = {
    channel: "channel",
    tags: {},
    args: [] as string[],
    text: "",
    reply: async (text: string) => {
      replies.push(text);
    },
  };
  await command(context);
  assert.match(replies[0]!, /concise/);
  await command({ ...context, args: ["detailed"] });
  assert.equal(store.get(), "concise");
  const moderator = { username: "mod", "user-id": "1", mod: true, badges: { moderator: "1" } };
  for (const args of [["bad"], ["detailed", "extra"]])
    await command({ ...context, tags: moderator, args });
  for (const mode of ["detailed", "educational", "concise"] as const) {
    await command({ ...context, tags: moderator, args: [mode] });
    assert.equal(store.get(), mode);
  }
  assert.equal(lines.length, 3);
  assert.ok(lines.every((line) => JSON.parse(line).event === "settings.mode.changed"));
});
