import type { CommandHandler } from "../types/commands.js";

/**
 * Handles the !about command by describing the bot and pointing to !help.
 *
 * @param context Command context containing the chat reply function.
 * @returns A promise that resolves after the response is sent.
 */
export const aboutCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply(
    "Sou um bot de chat com IA para Twitch. Uso o Gemini para responder perguntas de forma breve; use !help para ver os comandos.",
  );
};
