import type { ChatUserstate } from "tmi.js";
import type { CommandHandler, MessageHandler, ParsedCommand } from "../types/commands.js";
import type { ChatTransport } from "../twitch/types.js";
import {
  observability as defaultObservability,
  type Observability,
} from "../observability/index.js";
import { normalizeChatText } from "../safety/normalize-chat-text/index.js";
import { createAbuseLimiter } from "../safety/rate-limiter.js";
import { isModerator } from "../safety/permissions.js";
const knownCommands = new Set([
  "ai",
  "about",
  "help",
  "language",
  "ping",
  "queue",
  "question",
  "clearcontext",
  "mode",
  "status",
]);
export type { MessageHandler, ParsedCommand } from "../types/commands.js";

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
  client: ChatTransport,
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
 * @param observability Application-scoped telemetry.
 * @returns A promise that resolves after command handling completes.
 */
const handleMessage = async (
  client: ChatTransport,
  commandRegistry: CommandRegistry,
  channel: string,
  tags: ChatUserstate,
  message: string,
  self: boolean,
  observability: Observability,
): Promise<void> => {
  if (self) return;

  const parsedCommand = parseCommand(message);
  if (!parsedCommand) return;

  const command = commandRegistry.get(parsedCommand.name);
  if (!command) return;

  const startedAt = performance.now();
  let outcome = "success";
  try {
    await command({
      channel,
      tags,
      args: parsedCommand.args,
      text: parsedCommand.text,
      reply: createReply(client, channel),
    });
  } catch (error) {
    outcome = "error";
    observability.log("error", "command.completed", {
      command: parsedCommand.name,
      outcome,
      durationMs: performance.now() - startedAt,
      category:
        error instanceof TypeError || error instanceof ReferenceError ? "bug" : "operational",
    });
  }
  observability.increment(
    `commands.${knownCommands.has(parsedCommand.name) ? parsedCommand.name : "other"}.${outcome}`,
  );
  if (outcome === "success")
    observability.log("info", "command.completed", {
      command: parsedCommand.name,
      outcome,
      durationMs: performance.now() - startedAt,
    });
};

/**
 * Creates a Twitch message handler using the provided command registry.
 *
 * @param client Twitch client used for replies.
 * @param commandRegistry Explicit registry supplied by the application.
 * @param now Clock used by independent ordinary and administrative command limits.
 * @param observability Application-scoped telemetry.
 * @returns A handler suitable for the Twitch message event.
 */
export const createMessageHandler = (
  client: ChatTransport,
  commandRegistry: CommandRegistry,
  now: () => number = Date.now,
  observability: Observability = defaultObservability,
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
    if (self) return;
    observability.increment("messages.received");
    if (message.length > 2_000) return;
    const parsed = parseCommand(message);
    if (!parsed || !commandRegistry.has(parsed.name)) return;
    const admin = ["ai", "queue", "mode"].includes(parsed.name) && isModerator(tags, channel);
    if (now() >= windowStarted + 10_000) {
      windowStarted = now();
      ordinaryCount = 0;
      administrativeCount = 0;
    }
    if (admin ? administrativeCount >= 20 : ordinaryCount >= 20) {
      observability.increment("commands.cooldown");
      observability.log("debug", "command.completed", {
        command: parsed.name,
        outcome: "cooldown",
      });
      return;
    }
    if (
      !(admin ? administrative : ordinary).consume(
        `${channel}:${tags["user-id"] ?? tags.username?.toLowerCase() ?? "anonymous"}`,
      )
    ) {
      observability.increment("commands.cooldown");
      observability.log("debug", "command.completed", {
        command: parsed.name,
        outcome: "cooldown",
      });
      return;
    }
    if (admin) administrativeCount += 1;
    else ordinaryCount += 1;
    await handleMessage(client, commandRegistry, channel, tags, message, false, observability);
  };
};
