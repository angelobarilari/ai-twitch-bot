import type { AskOptions } from "../../ai/types.js";
import type { ConversationContext } from "../../ai/context.js";
import { conversationKey } from "../shared/conversation-key.js";
import type { AppConfig } from "../../config/validate.js";
import type { AiProvider } from "../../ai/types.js";
import type { StateStore } from "../../stores/types.js";
import type { Observability } from "../../observability/index.js";
import {
  createQuestionQueue,
  type QuestionQueue,
  type QueueStatus,
} from "../../queue/question-queue.js";
import { createAnswerHandler } from "../../ai/answer.js";
import { normalizeChatText } from "../../safety/normalize-chat-text/index.js";
import { isSafeChatText } from "../../safety/is-safe-chat-text/index.js";
import { canAskQuestion } from "../../safety/permissions.js";
import { createAbuseLimiter, type RateLimiter } from "../../safety/rate-limiter.js";
import { remainingSeconds } from "../../utils/remaining-seconds/index.js";
import type { CommandHandler } from "../../types/commands.js";
export type QuestionQueueStatus = QueueStatus;
export type ManagedQuestionCommand = CommandHandler & {
  getQueueStatus: QuestionQueue["status"];
  clearPendingQuestions: QuestionQueue["clear"];
  stopAccepting: QuestionQueue["stopAccepting"];
  waitForIdle: QuestionQueue["waitForIdle"];
};
/**
 * Creates a command using injected provider, store, queue, limiter, and configuration.
 * @param options Dependencies scoped to one bot instance.
 * @returns Question command with queue lifecycle methods for moderation and shutdown.
 * @throws If default queue limits are invalid.
 */
export const createQuestionHandler = (options: {
  config: AppConfig;
  provider: AiProvider;
  state: StateStore<boolean>;
  telemetry: Observability;
  now?: () => number;
  queue?: QuestionQueue;
  limiter?: RateLimiter;
  context?: ConversationContext;
  generation?: () => AskOptions;
}): ManagedQuestionCommand => {
  const { config, provider, state, telemetry: observability } = options;
  const now = options.now ?? Date.now;
  const queue =
    options.queue ??
    createQuestionQueue({
      capacity: config.maxPendingQuestions,
      activeTimeoutMs: config.questionTimeoutMs,
      waitingTimeoutMs: config.questionQueueTimeoutMs,
      now,
      telemetry: observability,
    });
  const answerQuestion = createAnswerHandler(provider, config, observability);
  const abuseLimiter =
    options.limiter ??
    createAbuseLimiter(
      {
        windowMs: config.questionWindowMs,
        maxAttempts: config.maxQuestionsPerWindow,
        penaltyMs: config.abusePenaltyMs,
        banMs: config.abuseBanMs,
        maxStrikes: config.abuseMaxStrikes,
        maxUsers: 10_000,
      },
      now,
    );
  const lastCommandAt = new Map<string, number>();
  let lastGlobalCommandAt = 0;

  /**
   * Validates and queues a viewer question, applying safety checks and cooldowns.
   *
   * @param context Command arguments, author metadata, and chat reply function.
   * @returns A promise that resolves after the question is answered or rejected.
   */
  const command: CommandHandler = async (context): Promise<void> => {
    const { args, reply, tags, text } = context;
    const username = tags.username?.toLowerCase() ?? "anonymous";
    const userKey = tags["user-id"] ?? username;
    const question = normalizeChatText(text || args.join(" "));
    const currentTime = now();

    if (!canAskQuestion(tags, context.channel, config.questionAccess)) {
      await reply("Your account does not meet the channel's question access requirements.");
      return;
    }
    if (!abuseLimiter.consume(userKey)) {
      observability.increment("questions.cooldown");
      observability.log("debug", "question.rejected", { outcome: "cooldown" });
      await reply("Too many attempts. Please try again later.");
      return;
    }

    if (!queue.isAccepting()) {
      await reply("The bot is shutting down. Please try again later.");
      return;
    }

    if (!state.get()) {
      await reply("The AI is currently disabled.");
      return;
    }

    if (question === "") {
      await reply("Usage: !question your question");
      return;
    }

    if (question === null) {
      await reply("I cannot process that type of question.");
      return;
    }

    if (Array.from(question).length > config.maxQuestionLength) {
      await reply(`Your question must be at most ${config.maxQuestionLength} characters long.`);
      return;
    }

    if (!isSafeChatText(question, [config.apiKey, config.token])) {
      abuseLimiter.penalize(userKey);
      await reply("I cannot process that type of question.");
      return;
    }

    const userAvailableAt = (lastCommandAt.get(userKey) ?? -Infinity) + config.userCooldownMs;
    const globalAvailableAt = lastGlobalCommandAt + config.commandCooldownMs;
    if (currentTime < userAvailableAt) {
      observability.increment("questions.cooldown");
      observability.log("debug", "question.rejected", { outcome: "cooldown" });
      abuseLimiter.penalize(userKey);
      await reply(`@${username}, please wait ${remainingSeconds(userAvailableAt, currentTime)}s.`);
      return;
    }

    if (currentTime < globalAvailableAt) {
      observability.increment("questions.cooldown");
      observability.log("debug", "question.rejected", { outcome: "cooldown" });
      await reply(
        `Please wait ${remainingSeconds(globalAvailableAt, currentTime)}s before the next question.`,
      );
      return;
    }

    if (queue.status().waiting + Number(queue.status().active) >= config.maxPendingQuestions) {
      observability.increment("questions.full");
      observability.log("warn", "question.rejected", { outcome: "full" });
      await reply("The AI question queue is full. Please try again later.");
      return;
    }

    for (const [key, time] of lastCommandAt) {
      if (currentTime >= time + config.userCooldownMs) lastCommandAt.delete(key);
    }
    if (lastCommandAt.size >= 10_000) {
      await reply("Too many attempts. Please try again later.");
      return;
    }
    lastCommandAt.set(userKey, currentTime);
    lastGlobalCommandAt = currentTime;
    const key = conversationKey(context.channel, tags);
    const session = key ? options.context?.begin(key) : undefined;
    const ticket = queue.enqueue({
      run: (signal) =>
        answerQuestion(
          question,
          reply,
          signal,
          { ...options.generation?.(), history: session?.read() },
          (answer) => session?.append(question, answer),
        ),
      expired: () => reply("Your question expired while waiting in the queue."),
      removed: (reason) =>
        reply(
          reason === "moderator"
            ? "Your question was removed from the queue by a moderator."
            : "The bot is shutting down; your queued question was not processed.",
        ),
      timedOut: () => reply("The AI request timed out. Please try again later."),
    });
    if (!ticket) {
      observability.increment("questions.full");
      await reply("The AI question queue is full. Please try again later.");
      return;
    }
    const { completion: responseTask, position: queuedPosition } = ticket;
    const responseTaskOutcome = responseTask.then(
      () => ({ succeeded: true as const }),
      (error: unknown) => ({ succeeded: false as const, error }),
    );

    if (queuedPosition !== null) {
      try {
        await reply(`Your question was added to the queue. Position: ${queuedPosition}.`);
      } catch (error) {
        void responseTaskOutcome.then((outcome) => {
          if (!outcome.succeeded) {
            observability.log("error", "queue.notification.failed", { outcome: "error" });
          }
        });
        throw error;
      }
    }

    const outcome = await responseTaskOutcome;
    if (!outcome.succeeded) throw outcome.error;
  };

  return Object.assign(command, {
    getQueueStatus: queue.status,
    clearPendingQuestions: queue.clear,
    stopAccepting: queue.stopAccepting,
    waitForIdle: queue.waitForIdle,
  });
};
