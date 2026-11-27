import type { AppConfig } from "./config/validate.js";
import type { AiProvider } from "./ai/types.js";
import type { StateStore } from "./stores/types.js";
import type { TwitchClient } from "./twitch/types.js";
import type { CommandHandler } from "./types/commands.js";
import {
  createObservability,
  startHealthReporting,
  type Observability,
} from "./observability/index.js";
import { createGeminiProvider } from "./ai/gemini/index.js";
import { createQuestionQueue, type QuestionQueue } from "./queue/question-queue.js";
import { createQuestionHandler } from "./commands/question/handler.js";
import { createAiCommand } from "./commands/ai/handler.js";
import { createLanguageCommand } from "./commands/language/handler.js";
import { createQueueCommand } from "./commands/queue/handler.js";
import { createStatusCommand } from "./commands/status/handler.js";
import { createHelpCommand } from "./commands/help/handler.js";
import { aboutCommand } from "./commands/about/index.js";
import { pingCommand } from "./commands/ping/index.js";
import { createMessageHandler } from "./twitch/message-handler.js";
import { createTwitchConnection } from "./twitch/connection.js";

/**
 * Composes one isolated bot without connecting or registering process listeners.
 * @param options Explicit configuration, transport, stores, and optional provider/queue/telemetry.
 * @returns Start, idempotent shutdown, dispatcher, command registry, and observable dependencies.
 */
export const createApp = (options: {
  config: AppConfig;
  client: TwitchClient;
  aiState: StateStore<boolean>;
  language: StateStore<string>;
  provider?: AiProvider;
  queue?: QuestionQueue;
  telemetry?: Observability;
  now?: () => number;
  reportHealth?: typeof startHealthReporting;
}) => {
  const { config, client, aiState, language } = options;
  const telemetry = options.telemetry ?? createObservability();
  const provider =
    options.provider ?? createGeminiProvider(config, { getLanguage: language.get, telemetry });
  const queue =
    options.queue ??
    createQuestionQueue({
      capacity: config.maxPendingQuestions,
      activeTimeoutMs: config.questionTimeoutMs,
      waitingTimeoutMs: config.questionQueueTimeoutMs,
      now: options.now,
      telemetry,
    });
  const question = createQuestionHandler({
    config,
    provider,
    state: aiState,
    telemetry,
    queue,
    now: options.now,
  });
  const commands = new Map<string, CommandHandler>([
    ["ai", createAiCommand(aiState, telemetry)],
    ["language", createLanguageCommand(language, telemetry)],
    ["queue", createQueueCommand(queue)],
    ["status", createStatusCommand(aiState, queue, telemetry)],
    ["question", question],
    ["help", createHelpCommand(config)],
    ["about", aboutCommand],
    ["ping", pingCommand],
  ]);
  const handleMessage = createMessageHandler(client, commands, options.now, telemetry);
  const connection = createTwitchConnection(client, handleMessage, telemetry);
  let startup: Promise<void> | undefined;
  let shutdownTask: Promise<void> | undefined;
  let stopHealthReporting: (() => void) | undefined;
  /**
   * Connects once and starts periodic reporting after successful startup.
   * @returns Startup completion, shared by repeated calls.
   * @throws If the transport cannot connect.
   */

  const start = (): Promise<void> => {
    if (shutdownTask) return Promise.reject(new Error("The application has already stopped."));
    startup ??= (async () => {
      telemetry.info("process.startup", {
        maxPendingQuestions: config.maxPendingQuestions,
        questionTimeoutMs: config.questionTimeoutMs,
        questionQueueTimeoutMs: config.questionQueueTimeoutMs,
        geminiTimeoutMs: config.geminiTimeoutMs,
        maxRetries: config.geminiMaxRetries,
        maxQuestionLength: config.maxQuestionLength,
        maxAnswerLength: config.maxAnswerLength,
        enabled: aiState.get(),
      });
      try {
        await connection.connect();
        if (!shutdownTask)
          stopHealthReporting = (options.reportHealth ?? startHealthReporting)(
            queue.status,
            aiState.get,
            60_000,
            telemetry,
          );
      } catch (error) {
        queue.stopAccepting();
        throw error;
      }
    })();
    return startup;
  };

  /**
   * Stops admission, drains accepted work, and disconnects exactly once.
   * @returns Shared shutdown completion.
   * @throws If the transport fails to disconnect.
   */
  const shutdown = (): Promise<void> => {
    shutdownTask ??= (async () => {
      telemetry.info("process.shutdown", { outcome: "cancelled" });
      stopHealthReporting?.();
      queue.stopAccepting();
      if (startup) await startup.catch(() => {});
      await queue.waitForIdle();
      try {
        await connection.disconnect();
        telemetry.info("process.shutdown", { outcome: "success" });
      } catch (error) {
        telemetry.error("process.shutdown", { outcome: "error", category: "operational" });
        throw error;
      }
    })();
    return shutdownTask;
  };
  return { start, shutdown, handleMessage, commands, queue, provider, telemetry };
};
