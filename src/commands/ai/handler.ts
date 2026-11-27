import type { CommandHandler } from "../../types/commands.js";
import type { StateStore } from "../../stores/types.js";
import type { Observability } from "../../observability/index.js";
import { isModerator } from "../../safety/permissions.js";
/**
 * Creates the !ai handler without process configuration or global state.
 * @param state Injected AI switch store.
 * @param observability Application telemetry.
 * @returns Command bound to the supplied application dependencies.
 */
export const createAiCommand =
  (state: StateStore<boolean>, observability: Observability): CommandHandler =>
  async ({ args, reply, tags, channel }): Promise<void> => {
    if (!isModerator(tags, channel)) {
      await reply("Only moderators and the broadcaster can control the AI.");
      return;
    }

    const action = args[0]?.toLowerCase();
    if (args.length === 0) {
      await reply(
        `The AI is currently ${state.get() ? "enabled" : "disabled"}. Use !ai on or !ai off.`,
      );
      return;
    }

    if (args.length !== 1 || (action !== "on" && action !== "off")) {
      await reply("Usage: !ai on or !ai off.");
      return;
    }

    const enabled = action === "on";
    try {
      state.set(enabled);
      observability.log("info", "admin.ai.changed", { enabled });
    } catch (error) {
      await reply("Could not save the AI state; the previous setting was kept.");
      return;
    }

    await reply(`AI ${enabled ? "enabled" : "disabled"}.`);
  };
