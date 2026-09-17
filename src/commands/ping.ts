import type { CommandHandler } from "./types.js";

/**
 * Handles the !ping command.
 *
 * @param context Command context containing the chat reply function.
 * @returns A promise that resolves after the status response is sent.
 */
export const pingCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply("Pong! Bot is online.");
};
