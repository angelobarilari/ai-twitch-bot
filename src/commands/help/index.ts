import { config } from "../../config.js";
import type { CommandHandler } from "../../types/commands.js";

/**
 * Handles the !help command by listing available commands and configured limits.
 *
 * @param context Command context containing the chat reply function.
 * @returns A promise that resolves after the command list is sent.
 */
export const helpCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply(
    `!help command list; !about bot info; !ping connection; !status AI status; !language <language|auto> channel language; !question <question> max ${config.maxQuestionLength} characters; !ai [on|off] and !queue [clear] (moderators). Cooldown: ${config.commandCooldownMs / 1000}s global/${config.userCooldownMs / 1000}s per user; queue max ${config.maxPendingQuestions}.`,
  );
};
