import { config } from "../config.js";
import type { CommandHandler } from "../types/commands.js";

/**
 * Handles the !help command by listing available commands and configured limits.
 *
 * @param context Command context containing the chat reply function.
 * @returns A promise that resolves after the command list is sent.
 */
export const helpCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply(
    `!help ajuda; !about sobre; !ping conexão; !status estado IA; !language <idioma|auto> idioma global; !question <pergunta> máx. ${config.maxQuestionLength} caracteres; !ai [on|off] e !queue [clear] (moderadores). Cooldown: ${config.commandCooldownMs / 1000}s global/${config.userCooldownMs / 1000}s por usuário; fila máx. ${config.maxPendingQuestions}.`,
  );
};
