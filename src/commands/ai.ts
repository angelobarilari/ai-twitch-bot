import type { CommandHandler } from "../types/commands.js";
import { isAiEnabled, setAiEnabled } from "./ai-state.js";
import { isModerator } from "./permissions.js";

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
  setAiEnabled(enabled);
  await reply(`IA ${enabled ? "ligada" : "desligada"}.`);
};
