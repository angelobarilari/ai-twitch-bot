import type { ChatUserstate } from "tmi.js";

/** Context passed to every registered command handler. */
export type CommandContext = {
  channel: string;
  tags: ChatUserstate;
  args: string[];
  text: string;
  reply: (message: string) => Promise<unknown>;
};

/** Function contract implemented by every bot command. */
export type CommandHandler = (context: CommandContext) => Promise<void>;
