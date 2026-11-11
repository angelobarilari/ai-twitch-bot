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
    await reply("Apenas moderadores e o broadcaster podem controlar a IA.");
    return;
  }

  const action = args[0]?.toLowerCase();
  if (args.length === 0) {
    await reply(`A IA está ${isAiEnabled() ? "ligada" : "desligada"}. Use !ai on ou !ai off.`);
    return;
  }

  if (args.length !== 1 || (action !== "on" && action !== "off")) {
    await reply("Uso: !ai on ou !ai off.");
    return;
  }

  const enabled = action === "on";
  try {
    setAiEnabled(enabled);
  } catch (error) {
    console.error("Failed to persist AI state:", error);
    await reply("Não foi possível salvar o estado da IA; a configuração anterior foi mantida.");
    return;
  }

  await reply(`IA ${enabled ? "ligada" : "desligada"}.`);
};
