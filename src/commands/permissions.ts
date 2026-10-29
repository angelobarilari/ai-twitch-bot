import type { ChatUserstate } from "tmi.js";

export function isModerator(tags: ChatUserstate): boolean {
  return tags.mod === true || tags.badges?.broadcaster === "1";
}
