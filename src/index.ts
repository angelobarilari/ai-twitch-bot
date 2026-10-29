import tmi from "tmi.js";
import { createMessageHandler } from "./commands/index.js";
import { config } from "./config.js";

const client = new tmi.Client({
  options: { debug: false },
  connection: { reconnect: true, secure: true },
  identity: { username: config.username, password: config.token },
  channels: [config.channel],
});

/**
 * Logs the successful Twitch connection.
 *
 * @param _address Server address supplied by tmi.js.
 * @param port Connected port supplied by tmi.js.
 * @returns Nothing.
 */
function handleConnected(_address: string, port: number): void {
  console.log(`Bot connected to channel #${config.channel} on port ${port}.`);
}

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

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; disconnecting from Twitch.`);

  try {
    await client.disconnect();
  } catch (error) {
    console.error("Failed to disconnect cleanly from Twitch:", error);
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

await client.connect();
