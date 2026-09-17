import tmi from "tmi.js";
import { createMessageHandler } from "./commands/index.js";
import { config } from "./config.js";

const client = new tmi.Client({
  options: { debug: false },
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
client.on("message", createMessageHandler(client));

await client.connect();
