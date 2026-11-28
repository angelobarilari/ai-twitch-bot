import type { StateStore } from "../../stores/types.js";
import type { CommandHandler } from "../../types/commands.js";
import { isResponseMode, type ResponseMode } from "../../ai/profiles.js";
import { isModerator } from "../../safety/permissions.js";
import type { Observability } from "../../observability/index.js";

/**
 * Creates a public mode query and moderator-only mode change command.
 * @param store Per-instance runtime response mode.
 * @param telemetry Sanitized administrative audit logger.
 * @returns Command accepting only fixed mode names.
 */
export const createModeCommand =
  (store: StateStore<ResponseMode>, telemetry: Observability): CommandHandler =>
  async ({ args, reply, tags, channel }) => {
    if (!args.length) {
      await reply(`Response mode: ${store.get()}.`);
      return;
    }
    if (!isModerator(tags, channel)) {
      await reply("Only moderators and the broadcaster can change response mode.");
      return;
    }
    if (args.length !== 1 || !isResponseMode(args[0])) {
      await reply("Usage: !mode concise|detailed|educational");
      return;
    }
    store.set(args[0]);
    telemetry.info("settings.mode.changed");
    await reply(`Response mode set to ${store.get()}.`);
  };
