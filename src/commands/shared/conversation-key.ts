import type { ChatUserstate } from "tmi.js";

/**
 * Builds a channel-scoped identity without pooling unidentified viewers.
 * @param channel Authenticated source channel.
 * @param tags Server-supplied viewer identity.
 * @returns Scoped key or null when no valid identity exists.
 */
export const conversationKey = (channel: string, tags: ChatUserstate): string | null => {
  if (/^[1-9]\d*$/.test(tags["user-id"] ?? ""))
    return `${channel.toLowerCase()}:id:${tags["user-id"]}`;
  if (/^[a-z0-9_]{1,25}$/i.test(tags.username ?? ""))
    return `${channel.toLowerCase()}:name:${tags.username!.toLowerCase()}`;
  return null;
};
