import assert from "node:assert/strict";
import test from "node:test";
import type { CommandContext } from "../types/commands.js";
import { aiCommand } from "./ai.js";
import { isAiEnabled, setAiEnabled } from "./ai-state.js";

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
    "IA desligada.",
    "A IA está desligada. Use !ai on ou !ai off.",
    "IA ligada.",
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
    "Apenas moderadores e o broadcaster podem controlar a IA.",
    "Uso: !ai on ou !ai off.",
    "Uso: !ai on ou !ai off.",
  ]);
});
