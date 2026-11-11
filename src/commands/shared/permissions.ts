import type { ChatUserstate } from "tmi.js";

/**
 * Checks whether a Twitch user is a moderator or the channel broadcaster.
 *
 * @param tags Twitch metadata for the user.
 * @returns Whether the user has moderator or broadcaster privileges.
 */
export function isModerator(tags: ChatUserstate): boolean {
  return tags.mod === true || tags.badges?.broadcaster === "1";
}
