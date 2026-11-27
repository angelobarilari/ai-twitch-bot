import tmi from "tmi.js";
import { observability, startHealthReporting } from "./services/observability.js";
import { isAiEnabled } from "./commands/shared/ai-state.js";
import { createMessageHandler } from "./commands/index.js";
import { questionCommand } from "./commands/question/index.js";
import { config } from "./config.js";
import { createShutdownHandler, registerShutdownHandlers } from "./services/shutdown.js";
import { createTwitchClientOptions } from "./services/twitch-client-options.js";

const client = new tmi.Client(createTwitchClientOptions(config));
let shuttingDown = false;

/**
 * Logs the successful Twitch connection.
 *
 * @param _address Server address supplied by tmi.js.
 * @param port Connected port supplied by tmi.js.
 * @returns Nothing.
 */
const handleConnected = (_address: string, port: number): void => {
  observability.setHealth("twitch", "ready");
};

client.on("connected", handleConnected);
client.on("reconnect", () => {
  if (!shuttingDown) observability.setHealth("twitch", "degraded");
});
client.on("disconnected", () => {
  observability.setHealth("twitch", "degraded");
});
client.on("message", createMessageHandler(client));

const stopHealthReporting = startHealthReporting(questionCommand.getQueueStatus, isAiEnabled);
observability.log("info", "process.startup", {
  maxPendingQuestions: config.maxPendingQuestions,
  questionTimeoutMs: config.questionTimeoutMs,
  questionQueueTimeoutMs: config.questionQueueTimeoutMs,
  geminiTimeoutMs: config.geminiTimeoutMs,
  maxRetries: config.geminiMaxRetries,
  maxQuestionLength: config.maxQuestionLength,
  maxAnswerLength: config.maxAnswerLength,
  enabled: isAiEnabled(),
});
const drainAndDisconnect = createShutdownHandler(client, questionCommand);
/**
 * Stops periodic reporting and drains work before disconnecting.
 * @param signal Termination signal.
 * @returns Completion of shutdown.
 */
const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  shuttingDown = true;
  stopHealthReporting();
  await drainAndDisconnect(signal);
};
registerShutdownHandlers((signal, listener) => {
  process.once(signal, listener);
}, shutdown);

try {
  await client.connect();
} catch {
  stopHealthReporting();
  observability.setHealth("twitch", "degraded");
  process.exitCode = 1;
}
