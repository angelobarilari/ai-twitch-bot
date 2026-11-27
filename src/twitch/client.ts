import tmi from "tmi.js";
import type { AppConfig } from "../config/validate.js";
import type { TwitchClient } from "./types.js";
import { createTwitchClientOptions } from "./client-options.js";

/**
 * Adapts tmi.js to the application's narrow transport contract.
 * @param config Validated Twitch credentials and channel.
 * @returns Transport operations without starting a connection.
 */
export const createTwitchClient = (config: AppConfig): TwitchClient => {
  const client = new tmi.Client(createTwitchClientOptions(config));
  return {
    connect: () => client.connect(),
    disconnect: () => client.disconnect(),
    say: (channel, message) => client.say(channel, message),
    onConnected: (listener) => {
      client.on("connected", listener);
    },
    onReconnect: (listener) => {
      client.on("reconnect", listener);
    },
    onDisconnected: (listener) => {
      client.on("disconnected", listener);
    },
    onMessage: (listener) => {
      client.on("message", listener);
    },
  };
};
