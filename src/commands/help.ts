import type { CommandHandler } from "../types/commands.js";

export const helpCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply(
    "Comandos: !help - lista os comandos; !about - sobre o bot; !ping - verifica se o bot está online; !question <pergunta> - pergunta para a IA; !ai on/off - controle da IA (moderadores); !queue - ver fila (moderadores); !queue clear - limpar espera (moderadores).",
  );
};
