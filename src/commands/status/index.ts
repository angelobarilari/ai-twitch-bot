import type { CommandHandler } from "../../types/commands.js";
import { isAiEnabled } from "../shared/ai-state.js";

/**
 * Handles the !status command by reporting whether AI responses are enabled.
 *
 * @param context Command context containing the chat reply function.
 * @returns A promise that resolves after the current status is sent.
 */
export const statusCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply(`The AI is ${isAiEnabled() ? "enabled" : "disabled"}.`);
};
