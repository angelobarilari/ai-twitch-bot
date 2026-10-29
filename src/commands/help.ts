import type { CommandHandler } from "../types/commands.js";

export const helpCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply(
    "Comandos: !help - lista os comandos; !ping - verifica se o bot está online; !question <sua pergunta> - pergunta para a IA.",
  );
};
