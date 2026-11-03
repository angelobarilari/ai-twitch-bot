import type { CommandHandler } from "../types/commands.js";

export const aboutCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply(
    "Sou um bot de chat com IA para Twitch. Uso o Gemini para responder perguntas de forma breve; use !help para ver os comandos.",
  );
};
