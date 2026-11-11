import type tmi from "tmi.js";
import type { CommandHandler, MessageHandler, ParsedCommand } from "../types/commands.js";
import { aiCommand } from "./ai.js";
import { aboutCommand } from "./about.js";
import { helpCommand } from "./help.js";
import { pingCommand } from "./ping.js";
import { queueCommand } from "./queue.js";
import { questionCommand } from "./question.js";
import { statusCommand } from "./status.js";
import { languageCommand } from "./language.js";

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
export function parseCommand(message: string): ParsedCommand | null {
  const trimmedMessage = message.trim();
  const [rawCommand, ...args] = trimmedMessage.split(/\s+/);

  if (!rawCommand?.startsWith("!")) return null;

  const name = rawCommand.slice(1).toLowerCase();
  if (!name) return null;

  return {
    name,
    args,
    text: trimmedMessage.slice(rawCommand.length).trim(),
  };
}

/**
 * Creates a reply function bound to a Twitch client and channel.
 *
 * @param client Twitch chat client used to send the response.
 * @param channel Channel where the response should be sent.
 * @returns A function that sends a message to the bound channel.
 */
function createReply(client: tmi.Client, channel: string): (response: string) => Promise<unknown> {
  return (response: string): Promise<unknown> => client.say(channel, response);
}

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
async function handleMessage(
  client: tmi.Client,
  commandRegistry: CommandRegistry,
  channel: string,
  tags: tmi.ChatUserstate,
  message: string,
  self: boolean,
): Promise<void> {
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
    console.error(`Failed to handle Twitch chat command "!${parsedCommand.name}":`, error);
  }
}

/**
 * Creates a Twitch message handler using the provided command registry.
 *
 * @param client Twitch client used for replies.
 * @param commandRegistry Commands available for dispatch; defaults to built-in commands.
 * @returns A handler suitable for the Twitch message event.
 */
export function createMessageHandler(
  client: tmi.Client,
  commandRegistry: CommandRegistry = commands,
): MessageHandler {
  return handleMessage.bind(null, client, commandRegistry);
}
