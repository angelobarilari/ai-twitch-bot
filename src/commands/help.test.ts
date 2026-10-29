import assert from "node:assert/strict";
import test from "node:test";
import type { CommandContext } from "../types/commands.js";
import { helpCommand } from "./help.js";

test("helpCommand lists available chat commands", async () => {
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

  await helpCommand(context);

  assert.deepEqual(replies, [
    "Comandos: !help - lista os comandos; !ping - verifica se o bot está online; !question <pergunta> - pergunta para a IA; !ai on/off - controle da IA (moderadores); !queue - ver fila (moderadores); !queue clear - limpar espera (moderadores).",
  ]);
});
