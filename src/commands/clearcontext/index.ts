import type { CommandHandler } from "../../types/commands.js";
import type { ConversationContext } from "../../ai/context.js";
import { conversationKey } from "../shared/conversation-key.js";

/**
 * Creates a viewer command that clears only the caller's current channel context.
 * @param context Volatile conversation storage owned by this bot instance.
 * @returns Command with strict no-argument validation.
 */
export const createClearContextCommand =
  (context: ConversationContext): CommandHandler =>
  async ({ args, tags, channel, reply }) => {
    if (args.length) {
      await reply("Usage: !clearcontext");
      return;
    }
    const key = conversationKey(channel, tags);
    if (key) context.clear(key);
    await reply("Your conversation context has been cleared.");
  };
