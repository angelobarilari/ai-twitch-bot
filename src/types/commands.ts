import type { ChatUserstate } from "tmi.js";

export type CommandContext = {
  channel: string;
  tags: ChatUserstate;
  args: string[];
  text: string;
  reply: (message: string) => Promise<unknown>;
};

export type CommandHandler = (context: CommandContext) => Promise<void>;

export type MessageHandler = (
  channel: string,
  tags: ChatUserstate,
  message: string,
  self: boolean,
) => Promise<void>;

export type ParsedCommand = {
  name: string;
  args: string[];
  text: string;
};
