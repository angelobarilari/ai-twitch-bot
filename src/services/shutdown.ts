import type tmi from "tmi.js";
import type { ManagedQuestionCommand } from "../commands/question/index.js";

export type ShutdownHandler = (signal: NodeJS.Signals) => Promise<void>;

/**
 * Creates an idempotent shutdown handler that drains question processing.
 *
 * @param client Twitch client to disconnect after processing stops.
 * @param questionCommand Queue lifecycle used to stop and drain new work.
 * @returns An asynchronous handler for a process termination signal.
 */
export const createShutdownHandler = (
  client: Pick<tmi.Client, "disconnect">,
  questionCommand: Pick<ManagedQuestionCommand, "stopAccepting" | "waitForIdle">,
): ShutdownHandler => {
  let shuttingDown = false;

  return async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; stopping new questions and draining the active request.`);

    try {
      questionCommand.stopAccepting();
      await questionCommand.waitForIdle();
      console.log("Question processing stopped; disconnecting from Twitch.");
      await client.disconnect();
    } catch (error) {
      console.error("Failed to disconnect cleanly from Twitch:", error);
      process.exitCode = 1;
    }
  };
};

/**
 * Registers the shutdown handler for both supported process termination signals.
 *
 * @param registerOnce Process-like function that registers a one-time signal listener.
 * @param shutdown Handler invoked for a termination signal.
 * @returns Nothing.
 */
export const registerShutdownHandlers = (
  registerOnce: (signal: NodeJS.Signals, listener: () => void) => void,
  shutdown: ShutdownHandler,
): void => {
  registerOnce("SIGINT", () => void shutdown("SIGINT"));
  registerOnce("SIGTERM", () => void shutdown("SIGTERM"));
};
