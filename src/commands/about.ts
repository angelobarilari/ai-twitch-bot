import type { CommandHandler } from "../types/commands.js";

/**
 * Handles the !about command by describing the bot and pointing to !help.
 *
 * @param context Command context containing the chat reply function.
 * @returns A promise that resolves after the response is sent.
 */
export const aboutCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply(
    "I am an AI chat bot for Twitch. I use Gemini to answer questions briefly; use !help to see the available commands.",
  );
};
