import type { CommandHandler } from "../types/commands.js";
import { isAiEnabled, setAiEnabled } from "./ai-state.js";
import { isModerator } from "./permissions.js";

/**
 * Handles the moderator-only !ai command for reading or changing AI state.
 *
 * @param context Command arguments, author metadata, and chat reply function.
 * @returns A promise that resolves after the command response is sent.
 */
export const aiCommand: CommandHandler = async ({ args, reply, tags }): Promise<void> => {
  if (!isModerator(tags)) {
    await reply("Only moderators and the broadcaster can control the AI.");
    return;
  }

  const action = args[0]?.toLowerCase();
  if (args.length === 0) {
    await reply(
      `The AI is currently ${isAiEnabled() ? "enabled" : "disabled"}. Use !ai on or !ai off.`,
    );
    return;
  }

  if (args.length !== 1 || (action !== "on" && action !== "off")) {
    await reply("Usage: !ai on or !ai off.");
    return;
  }

  const enabled = action === "on";
  try {
    setAiEnabled(enabled);
  } catch (error) {
    console.error("Failed to persist AI state:", error);
    await reply("Could not save the AI state; the previous setting was kept.");
    return;
  }

  await reply(`AI ${enabled ? "enabled" : "disabled"}.`);
};
