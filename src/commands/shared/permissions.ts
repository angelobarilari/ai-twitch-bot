import type { ChatUserstate } from "tmi.js";

/**
 * Checks whether a Twitch user is a moderator or the channel broadcaster.
 *
 * @param tags Twitch metadata for the user.
 * @param channel Expected channel, with or without a leading hash.
 * @returns Whether consistent identity and role metadata authorize moderation.
 */
export const isModerator = (tags: ChatUserstate, channel: string): boolean => {
  if (!isKnownUser(tags)) return false;
  if (tags.badges?.broadcaster !== undefined) return isBroadcaster(tags, channel);
  return tags.mod === true && tags.badges?.moderator === "1";
};

/**
 * Checks for a well-formed server-supplied Twitch identity.
 *
 * @param tags Twitch metadata supplied by the authenticated IRC connection.
 * @returns Whether username and numeric user ID are present.
 */
export const isKnownUser = (tags: ChatUserstate): boolean =>
  /^[a-z0-9_]{1,25}$/i.test(tags.username ?? "") && /^[1-9]\d*$/.test(tags["user-id"] ?? "");

/**
 * Verifies that a broadcaster badge belongs to the current channel owner.
 *
 * @param tags Twitch author metadata.
 * @param channel Expected channel name.
 * @returns Whether identity and broadcaster badge agree with the channel.
 */
export const isBroadcaster = (tags: ChatUserstate, channel: string): boolean =>
  isKnownUser(tags) &&
  tags.badges?.broadcaster === "1" &&
  tags.username?.toLowerCase() === channel.replace(/^#/, "").toLowerCase();

/**
 * Applies the configured question access policy to authenticated Twitch metadata.
 *
 * @param tags Twitch author metadata.
 * @param channel Current channel.
 * @param access Required identity or role.
 * @returns Whether the viewer may ask questions.
 */
export const canAskQuestion = (tags: ChatUserstate, channel: string, access: string): boolean => {
  if (access === "everyone") return true;
  if (!isKnownUser(tags)) return false;
  if (access === "known") return true;
  if (access === "broadcaster") return isBroadcaster(tags, channel);
  if (access === "moderator") return isModerator(tags, channel);
  return (
    access === "subscriber" &&
    (isModerator(tags, channel) ||
      (tags.subscriber === true && tags.badges?.subscriber !== undefined))
  );
};
