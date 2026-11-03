import assert from "node:assert/strict";
import test from "node:test";
import type { CommandContext } from "../types/commands.js";
import { aboutCommand } from "./about.js";

test("aboutCommand explains the bot and points viewers to help", async () => {
  const replies: string[] = [];
  const context: CommandContext = {
    channel: "test_channel",
    tags: {},
    args: [],
    text: "",
    reply: async (message) => {
      replies.push(message);
    },
  };

  await aboutCommand(context);

  assert.deepEqual(replies, [
    "Sou um bot de chat com IA para Twitch. Uso o Gemini para responder perguntas de forma breve; use !help para ver os comandos.",
  ]);
});
