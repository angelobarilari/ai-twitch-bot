import { observability } from "../../services/observability.js";
import { questionCommand } from "../question/index.js";
import type { CommandHandler } from "../../types/commands.js";
import { isAiEnabled } from "../shared/ai-state.js";

/**
 * Handles the !status command by reporting whether AI responses are enabled.
 *
 * @param context Command context containing the chat reply function.
 * @returns A promise that resolves after the current status is sent.
 */
export const statusCommand: CommandHandler = async ({ reply }): Promise<void> => {
  const { health } = observability.snapshot();
  const queue = questionCommand.getQueueStatus();
  await reply(
    `The AI is ${isAiEnabled() ? "enabled" : "disabled"}. Twitch: ${health.twitch}; Gemini: ${health.gemini}; persistence: ${health.aiState}/${health.language}; queue: ${queue.active ? "active" : "idle"}, ${queue.waiting} waiting.`,
  );
};
