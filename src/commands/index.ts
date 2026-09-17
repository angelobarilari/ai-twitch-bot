import type tmi from "tmi.js";
import { pingCommand } from "./ping.js";
import { questionCommand } from "./question.js";
import type { CommandHandler } from "./types.js";

export type MessageHandler = (channel: string, tags: tmi.ChatUserstate, message: string, self: boolean) => Promise<void>;

export type ParsedCommand = {
  name: string;
  args: string[];
  text: string;
};

const commands = new Map<string, CommandHandler>([
  ["ping", pingCommand],
  ["question", questionCommand],
]);

export function parseCommand(message: string): ParsedCommand | null {
  const trimmedMessage = message.trim();
  const [rawCommand, ...args] = trimmedMessage.split(/\s+/);

  if (!rawCommand?.startsWith("!")) return null;

  return {
    name: rawCommand.slice(1).toLowerCase(),
    args,
    text: trimmedMessage.slice(rawCommand.length).trim(),
  };
}

function createReply(client: tmi.Client, channel: string): (response: string) => Promise<unknown> {
  return (response: string): Promise<unknown> => client.say(channel, response);
}

async function handleMessage(
  client: tmi.Client,
  channel: string,
  tags: tmi.ChatUserstate,
  message: string,
  self: boolean,
): Promise<void> {
  if (self) return;

  const parsedCommand = parseCommand(message);
  if (!parsedCommand) return;

  const command = commands.get(parsedCommand.name);
  if (!command) return;

  await command({
    channel,
    tags,
    args: parsedCommand.args,
    text: parsedCommand.text,
    reply: createReply(client, channel),
  });
}

export function createMessageHandler(client: tmi.Client): MessageHandler {
  return handleMessage.bind(null, client);
}
