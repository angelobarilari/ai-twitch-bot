import type { TwitchClient } from "./types.js";
import type { MessageHandler } from "../types/commands.js";
import type { Observability } from "../observability/index.js";

/**
 * Wires one transport's events without logging server messages or chat content.
 * @param client Twitch event transport.
 * @param handler Application command dispatcher.
 * @param telemetry Isolated component health.
 * @returns Connection and draining-disconnection operations.
 */
export const createTwitchConnection = (
  client: TwitchClient,
  handler: MessageHandler,
  telemetry: Observability,
) => {
  let stopping = false;
  client.onConnected(() => {
    if (!stopping) telemetry.setHealth("twitch", "ready");
  });
  client.onReconnect(() => {
    if (!stopping) telemetry.setHealth("twitch", "degraded");
  });
  client.onDisconnected(() => {
    if (!stopping) telemetry.setHealth("twitch", "degraded");
  });
  client.onMessage(handler);
  return {
    connect: async (): Promise<void> => {
      try {
        await client.connect();
      } catch {
        telemetry.setHealth("twitch", "degraded");
        throw new Error("Failed to connect to Twitch.");
      }
    },
    disconnect: async (): Promise<void> => {
      stopping = true;
      try {
        await client.disconnect();
        telemetry.setHealth("twitch", "stopped");
      } catch {
        telemetry.setHealth("twitch", "degraded");
        throw new Error("Failed to disconnect from Twitch.");
      }
    },
  };
};
