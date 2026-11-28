import type { CommandHandler } from "../../types/commands.js";
import type { ChannelMemory } from "../../ai/channel-memory.js";
import type { Observability } from "../../observability/index.js";
import { isModerator } from "../../safety/permissions.js";
import { splitForTwitch } from "../../utils/split-for-twitch/index.js";

/**
 * Creates public paginated listing and strictly authorized channel-memory administration.
 * @param memory Channel-scoped transactional memory.
 * @param telemetry Content-free audit logger.
 * @param invalidateContext Invalidates conversation snapshots after a successful mutation.
 * @returns Command with fixed actions, bounded text, TTLs, and pagination.
 */
export const createMemoryCommand =
  (
    memory: ChannelMemory,
    telemetry: Observability,
    invalidateContext: () => void,
  ): CommandHandler =>
  async ({ args, tags, channel, reply }) => {
    const [action, id, ttl, ...words] = args;
    if (action === "list") {
      const page = Number(id ?? "1");
      if (args.length > 2 || !Number.isSafeInteger(page) || page < 1) {
        await reply("Usage: !memory list [page]");
        return;
      }
      const facts = memory.list(channel);
      const pages = Math.max(1, Math.ceil(facts.length / 2));
      if (page > pages) {
        await reply("That fact page does not exist.");
        return;
      }
      const selected = facts.slice((page - 1) * 2, page * 2);
      for (const chunk of splitForTwitch(
        selected.length
          ? `Known facts (${page}/${pages}): ${selected.map((fact) => `${fact.id}: ${fact.text}`).join("; ")}`
          : "There are no active channel facts.",
        430,
      ))
        await reply(chunk);
      return;
    }
    if (!isModerator(tags, channel)) {
      await reply("Only moderators and the broadcaster can manage channel memory.");
      return;
    }
    if (
      !((action === "on" || action === "off") && args.length === 1) &&
      !(action === "remove" && args.length === 2) &&
      !((action === "add" || action === "edit") && args.length >= 4)
    ) {
      await reply(
        "Usage: !memory on|off|list [page]|add <key> <ttl-minutes> <fact>|edit <key> <ttl-minutes> <fact>|remove <key>",
      );
      return;
    }
    try {
      memory.change(
        channel,
        tags["user-id"]!,
        action as "on" | "off" | "add" | "edit" | "remove",
        id,
        words.join(" "),
        Number(ttl),
      );
    } catch {
      telemetry.warn("memory.changed", { outcome: "error", category: "operational" });
      await reply(
        "Could not update channel memory. Check the key, safe fact text, TTL (1-43200 minutes), capacity, and storage.",
      );
      return;
    }
    invalidateContext();
    telemetry.info("memory.changed", { outcome: "success", actorId: tags["user-id"], action });
    await reply("Channel memory updated.");
  };
