import type { Options } from "tmi.js";
import type { AppConfig } from "../config.js";

/**
 * Builds the Twitch client options, including the capped reconnect backoff.
 *
 * @param appConfig Twitch credentials and channel configuration.
 * @returns Options passed to the tmi.js client constructor.
 */
export const createTwitchClientOptions = (
  appConfig: Pick<AppConfig, "username" | "token" | "channel">,
): Options => {
  return {
    // tmi.js can log raw chat even with debug disabled. Lifecycle events are logged by the app.
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    options: { debug: false },
    connection: {
      reconnect: true,
      secure: true,
      reconnectInterval: 1000,
      maxReconnectInterval: 30_000,
      reconnectDecay: 1.5,
    },
    identity: { username: appConfig.username, password: appConfig.token },
    channels: [appConfig.channel],
  };
};
