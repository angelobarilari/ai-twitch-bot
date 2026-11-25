import type tmi from "tmi.js";
import type { CommandHandler, MessageHandler, ParsedCommand } from "../types/commands.js";
import { aiCommand } from "./ai/index.js";
import { aboutCommand } from "./about/index.js";
import { helpCommand } from "./help/index.js";
import { pingCommand } from "./ping/index.js";
import { queueCommand } from "./queue/index.js";
import { questionCommand } from "./question/index.js";
import { statusCommand } from "./status/index.js";
import { languageCommand } from "./language/index.js";
import { normalizeChatText } from "../utils/normalize-chat-text/index.js";
import { createAbuseLimiter } from "../services/abuse-limiter.js";
import { isModerator } from "./shared/permissions.js";

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

type CommandRegistry = ReadonlyMap<string, CommandHandler>;

/**
 * Parses a Twitch chat message into a command name and its arguments.
 *
 * @param message Incoming chat message.
 * @returns Parsed command details, or null if the message is not a named command.
 */
export const parseCommand = (message: string): ParsedCommand | null => {
  const trimmedMessage = normalizeChatText(message);
  if (!trimmedMessage) return null;
  const [rawCommand, ...args] = trimmedMessage.split(/\s+/);

  if (!rawCommand?.startsWith("!")) return null;

  const name = rawCommand.slice(1).toLowerCase();
  if (!name) return null;

  return {
    name,
    args,
    text: trimmedMessage.slice(rawCommand.length).trim(),
  };
};

/**
 * Creates a reply function bound to a Twitch client and channel.
 *
 * @param client Twitch chat client used to send the response.
 * @param channel Channel where the response should be sent.
 * @returns A function that sends a message to the bound channel.
 */
const createReply = (
  client: tmi.Client,
  channel: string,
): ((response: string) => Promise<unknown>) => {
  return (response: string): Promise<unknown> => client.say(channel, response);
};

/**
 * Dispatches a chat message to its registered command, if any.
 *
 * @param client Twitch client used to send command replies.
 * @param commandRegistry Commands available for dispatch.
 * @param channel Channel where the message was received.
 * @param tags Twitch metadata for the message author.
 * @param message Raw chat message.
 * @param self Whether the message was sent by this bot.
 * @returns A promise that resolves after command handling completes.
 */
const handleMessage = async (
  client: tmi.Client,
  commandRegistry: CommandRegistry,
  channel: string,
  tags: tmi.ChatUserstate,
  message: string,
  self: boolean,
): Promise<void> => {
  if (self) return;

  const parsedCommand = parseCommand(message);
  if (!parsedCommand) return;

  const command = commandRegistry.get(parsedCommand.name);
  if (!command) return;

  try {
    await command({
      channel,
      tags,
      args: parsedCommand.args,
      text: parsedCommand.text,
      reply: createReply(client, channel),
    });
  } catch (error) {
    console.error("Failed to handle Twitch chat command.");
  }
};

/**
 * Creates a Twitch message handler using the provided command registry.
 *
 * @param client Twitch client used for replies.
 * @param commandRegistry Commands available for dispatch; defaults to built-in commands.
 * @param now Clock used by independent ordinary and administrative command limits.
 * @returns A handler suitable for the Twitch message event.
 */
export const createMessageHandler = (
  client: tmi.Client,
  commandRegistry: CommandRegistry = commands,
  now: () => number = Date.now,
): MessageHandler => {
  const policy = {
    windowMs: 10_000,
    maxAttempts: 5,
    penaltyMs: 1_000,
    banMs: 60_000,
    maxStrikes: 3,
    maxUsers: 10_000,
  };
  const ordinary = createAbuseLimiter(policy, now);
  const administrative = createAbuseLimiter({ ...policy, maxAttempts: 10 }, now);
  let windowStarted = now();
  let ordinaryCount = 0;
  let administrativeCount = 0;
  return async (channel, tags, message, self): Promise<void> => {
    if (self || message.length > 2_000) return;
    const parsed = parseCommand(message);
    if (!parsed || !commandRegistry.has(parsed.name)) return;
    const admin = (parsed.name === "ai" || parsed.name === "queue") && isModerator(tags, channel);
    if (now() >= windowStarted + 10_000) {
      windowStarted = now();
      ordinaryCount = 0;
      administrativeCount = 0;
    }
    if (admin ? administrativeCount >= 20 : ordinaryCount >= 20) return;
    if (
      !(admin ? administrative : ordinary).consume(
        `${channel}:${tags["user-id"] ?? tags.username?.toLowerCase() ?? "anonymous"}`,
      )
    )
      return;
    if (admin) administrativeCount += 1;
    else ordinaryCount += 1;
    await handleMessage(client, commandRegistry, channel, tags, message, false);
  };
};
