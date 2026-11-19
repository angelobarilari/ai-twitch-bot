import tmi from "tmi.js";
import { createMessageHandler } from "./commands/index.js";
import { questionCommand } from "./commands/question/index.js";
import { config } from "./config.js";
import { createShutdownHandler, registerShutdownHandlers } from "./services/shutdown.js";
import { createTwitchClientOptions } from "./services/twitch-client-options.js";

const client = new tmi.Client(createTwitchClientOptions(config));

/**
 * Logs the successful Twitch connection.
 *
 * @param _address Server address supplied by tmi.js.
 * @param port Connected port supplied by tmi.js.
 * @returns Nothing.
 */
const handleConnected = (_address: string, port: number): void => {
  console.log(`Bot connected to channel #${config.channel} on port ${port}.`);
};

client.on("connected", handleConnected);
client.on("connecting", (address, port) => {
  console.log(`Connecting to Twitch at ${address}:${port}.`);
});
client.on("reconnect", () => {
  console.warn("Twitch connection lost; reconnecting.");
});
client.on("disconnected", (reason) => {
  console.warn(`Disconnected from Twitch: ${reason}`);
});
client.on("message", createMessageHandler(client));

/**
 * Disconnects the Twitch client after the current question processing is drained.
 *
 * @param signal Signal that initiated shutdown.
 * @returns A promise that resolves after the disconnect attempt completes.
 */
const shutdown = createShutdownHandler(client, questionCommand);
registerShutdownHandlers((signal, listener) => {
  process.once(signal, listener);
}, shutdown);

await client.connect();
