import type { CommandHandler } from "../../types/commands.js";
import type { AppConfig } from "../../config/validate.js";
/**
 * Creates the !help handler without process configuration or global state.
 * @param config Validated command limits.
 * @returns Command bound to the supplied application dependencies.
 */
export const createHelpCommand =
  (config: AppConfig): CommandHandler =>
  async ({ reply }): Promise<void> => {
    await reply(
      `!help command list; !about bot info; !ping connection; !status AI status; !language <language|auto> channel language; !question <question> max ${config.maxQuestionLength} characters; !ai [on|off] and !queue [clear] (moderators). Cooldown: ${config.commandCooldownMs / 1000}s global/${config.userCooldownMs / 1000}s per user; queue max ${config.maxPendingQuestions}.`,
    );
  };
