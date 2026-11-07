import type { CommandHandler } from "../types/commands.js";
import { isAiEnabled } from "./ai-state.js";

export const statusCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply(`A IA está ${isAiEnabled() ? "ligada" : "desligada"}.`);
};
