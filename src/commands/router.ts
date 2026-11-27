import type { CommandHandler } from "../types/commands.js";
import type { ChatTransport } from "../twitch/types.js";
import { createMessageHandler as createHandler } from "../twitch/message-handler.js";
import { aiCommand } from "./ai/index.js";
import { aboutCommand } from "./about/index.js";
import { helpCommand } from "./help/index.js";
import { languageCommand } from "./language/index.js";
import { pingCommand } from "./ping/index.js";
import { queueCommand } from "./queue/index.js";
import { questionCommand } from "./question/index.js";
import { statusCommand } from "./status/index.js";
export { parseCommand } from "../twitch/message-handler.js";
export type { MessageHandler, ParsedCommand } from "../types/commands.js";
const commands = new Map<string, CommandHandler>([
  ["ai", aiCommand],
  ["about", aboutCommand],
  ["help", helpCommand],
  ["language", languageCommand],
  ["ping", pingCommand],
  ["queue", queueCommand],
  ["question", questionCommand],
  ["status", statusCommand],
]);
/**
 * Binds the existing command registry to the independent Twitch dispatcher.
 * @param client Chat reply transport.
 * @param registry Optional replacement command registry.
 * @param now Clock for command rate limits.
 * @returns Incoming message handler.
 */
export const createMessageHandler = (
  client: ChatTransport,
  registry: ReadonlyMap<string, CommandHandler> = commands,
  now: () => number = Date.now,
) => createHandler(client, registry, now);
