import type { MessageHandler } from "../types/commands.js";

export type ChatTransport = {
  say: (channel: string, message: string) => Promise<unknown>;
};

export type TwitchClient = ChatTransport & {
  connect: () => Promise<unknown>;
  disconnect: () => Promise<unknown>;
  onConnected: (listener: () => void) => void;
  onReconnect: (listener: () => void) => void;
  onDisconnected: (listener: () => void) => void;
  onMessage: (listener: MessageHandler) => void;
};
