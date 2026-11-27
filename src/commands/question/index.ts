import { observability } from "../../services/observability.js";
import { config } from "../../config.js";
import { askGemini } from "../../services/gemini.js";
import type { GeminiRequester } from "../../services/gemini.js";
import { normalizeChatText } from "../../utils/normalize-chat-text/index.js";
import { isSafeChatText } from "../../utils/is-safe-chat-text/index.js";
import { remainingSeconds } from "../../utils/remaining-seconds/index.js";
import { splitForTwitch } from "../../utils/split-for-twitch/index.js";
import type { CommandHandler } from "../../types/commands.js";
import { isAiEnabled } from "../shared/ai-state.js";
import { canAskQuestion } from "../shared/permissions.js";
import { createAbuseLimiter } from "../../services/abuse-limiter.js";

export type QuestionQueueStatus = {
  active: boolean;
  waiting: number;
};

type PendingQuestion = {
  enqueuedAt: number;
  question: string;
  reply: (message: string) => Promise<unknown>;
  resolve: () => void;
  reject: (error: unknown) => void;
  expiresTimer?: NodeJS.Timeout;
};

export type ManagedQuestionCommand = CommandHandler & {
  /**
   * Returns whether a question is active and how many requests are waiting.
   *
   * @returns Current queue activity and waiting count.
   */
  getQueueStatus: () => QuestionQueueStatus;
  /**
   * Removes waiting requests and notifies their authors.
   *
   * @returns The number of removed requests.
   * @throws If a notification reply fails.
   */
  clearPendingQuestions: () => Promise<number>;
  /**
   * Prevents new questions and discards requests that have not started.
   *
   * @returns Nothing.
   */
  stopAccepting: () => void;
  /**
   * Resolves after the active request and all queued work have finished.
   *
   * @returns A promise that resolves when the queue becomes idle.
   */
  waitForIdle: () => Promise<void>;
};

/**
 * Creates a !question command handler with isolated cooldowns and response queue.
 *
 * @param askQuestion Gemini request function.
 * @param now Clock used to evaluate cooldowns.
 * @param questionTimeoutMs Maximum processing time for the active question.
 * @param questionQueueTimeoutMs Maximum time a question may wait in the queue.
 * @returns A command handler that serializes accepted Gemini requests.
 * @throws If either timeout is not a positive duration supported by Node timers.
 */
export const createQuestionCommand = (
  askQuestion: GeminiRequester = askGemini,
  now: () => number = Date.now,
  questionTimeoutMs = config.questionTimeoutMs,
  questionQueueTimeoutMs = config.questionQueueTimeoutMs,
): ManagedQuestionCommand => {
  for (const [name, timeout] of [
    ["questionTimeoutMs", questionTimeoutMs],
    ["questionQueueTimeoutMs", questionQueueTimeoutMs],
  ] as const) {
    if (!Number.isSafeInteger(timeout) || timeout <= 0 || timeout > 2_147_483_647) {
      throw new RangeError(`${name} must be a positive supported timer duration.`);
    }
  }

  const abuseLimiter = createAbuseLimiter(
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
  let pendingQuestionCount = 0;
  let activeQuestion = false;
  let acceptingQuestions = true;
  const pendingQuestions: PendingQuestion[] = [];
  let idleWaiters: Array<() => void> = [];

  /**
   * Resolves shutdown waiters after all active and queued requests have finished.
   *
   * @returns Nothing.
   */
  const resolveIdleWaiters = (): void => {
    if (pendingQuestionCount !== 0) return;
    for (const resolve of idleWaiters) resolve();
    idleWaiters = [];
  };

  /**
   * Waits until no active or queued question remains.
   *
   * @returns A promise that resolves when question processing becomes idle.
   */
  const waitForIdle = (): Promise<void> =>
    pendingQuestionCount === 0
      ? Promise.resolve()
      : new Promise((resolve) => idleWaiters.push(resolve));

  /**
   * Sends a queue notification without blocking question processing.
   *
   * @param reply Reply function for the originating chat channel.
   * @param message Notification to send.
   * @returns Nothing.
   */
  const sendDetachedReply = (reply: PendingQuestion["reply"], message: string): void => {
    void Promise.resolve()
      .then(() => reply(message))
      .catch((error: unknown) => {
        observability.log("error", "queue.notification.failed", {
          outcome: "error",
          category: "operational",
        });
      });
  };

  /**
   * Removes a queued request whose waiting deadline has passed.
   *
   * @param pending Queued request to expire.
   * @returns Nothing.
   */
  const expirePendingQuestion = (pending: PendingQuestion): void => {
    const index = pendingQuestions.indexOf(pending);
    if (index === -1) return;

    observability.increment("queue.expired");
    observability.observe("queue.waitMs", Math.max(0, now() - pending.enqueuedAt));
    observability.log("warn", "queue.expired", { outcome: "expired" });
    pendingQuestions.splice(index, 1);
    pendingQuestionCount -= 1;
    pending.resolve();
    sendDetachedReply(pending.reply, "Your question expired while waiting in the queue.");
    resolveIdleWaiters();
  };

  /**
   * Removes all waiting requests and optionally notifies their authors.
   *
   * @param message Optional notification to send for each removed request.
   * @returns The number of requests removed from the queue.
   */
  const removePendingQuestions = (message?: string): number => {
    const removedQuestions = pendingQuestions.splice(0);
    if (removedQuestions.length)
      observability.log("info", "queue.cleared", {
        outcome: "cleared",
        count: removedQuestions.length,
      });
    pendingQuestionCount -= removedQuestions.length;

    for (const pending of removedQuestions) {
      if (pending.expiresTimer) clearTimeout(pending.expiresTimer);
      pending.resolve();
      if (message) sendDetachedReply(pending.reply, message);
    }

    resolveIdleWaiters();
    return removedQuestions.length;
  };

  /**
   * Obtains and validates an answer, then sends it through Twitch chat.
   *
   * @param question Question text to send to Gemini.
   * @param reply Reply function for the originating chat channel.
   * @param signal Cancellation signal for the active question deadline.
   * @returns A promise that resolves after the answer or an error message is sent.
   */
  const answerQuestion = async (
    question: string,
    reply: PendingQuestion["reply"],
    signal: AbortSignal,
  ): Promise<string> => {
    try {
      const generated = await askQuestion(question, { signal });
      let answer = normalizeChatText(generated ?? "");
      if (signal.aborted) return "cancelled";
      if (!answer || !isSafeChatText(answer, [config.apiKey, config.token])) {
        await reply("The AI could not generate a safe answer for that question.");
        return generated === null ? "error" : "unsafe";
      }

      if (Array.from(answer).length > config.maxAnswerLength) {
        answer = normalizeChatText((await askQuestion(question, { signal, concise: true })) ?? "");
        if (signal.aborted) return "cancelled";
      }

      if (!answer || !isSafeChatText(answer, [config.apiKey, config.token])) {
        await reply("The AI could not generate a safe answer for that question.");
        return "unsafe";
      }

      if (Array.from(answer).length > config.maxAnswerLength) {
        await reply(
          "I could not provide a complete answer within the chat limit. Please try a shorter question.",
        );
        return "too_long";
      }

      for (const chunk of splitForTwitch(answer, 430)) {
        if (signal.aborted) return "cancelled";
        await reply(chunk);
      }
      observability.observe("answers.characters", Array.from(answer).length);
      return "success";
    } catch (error) {
      if (signal.aborted) return "cancelled";
      await reply("I could not query the AI right now. Please try again later.");
      return "error";
    }
  };

  /**
   * Applies the active-request timeout and reports a timeout to the author.
   *
   * @param pending Active queued request to process.
   * @returns A promise that resolves after processing or timeout notification.
   */
  const answerQuestionWithTimeout = async (pending: PendingQuestion): Promise<void> => {
    const startedAt = performance.now();
    let outcome = "error";
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;

    try {
      const timedOut = await Promise.race([
        answerQuestion(pending.question, pending.reply, controller.signal),
        new Promise<string>((resolve) => {
          timer = setTimeout(() => {
            controller.abort();
            resolve("timeout");
          }, questionTimeoutMs);
        }),
      ]);

      outcome = timedOut;
      if (timedOut === "timeout") {
        sendDetachedReply(pending.reply, "The AI request timed out. Please try again later.");
      }
    } finally {
      if (timer) clearTimeout(timer);
      observability.increment(`questions.${outcome}`);
      observability.observe("questions.durationMs", performance.now() - startedAt);
      observability.log(
        outcome === "success" ? "info" : outcome === "error" ? "error" : "warn",
        "question.completed",
        {
          outcome,
          category: "operational",
          durationMs: performance.now() - startedAt,
          queueWaiting: pendingQuestions.length,
        },
      );
    }
  };

  /**
   * Starts processing the next queued question when no request is active.
   *
   * @returns Nothing.
   */
  const processNextQuestion = (): void => {
    if (activeQuestion) return;

    const pending = pendingQuestions.shift();
    if (!pending) return;
    if (pending.expiresTimer) clearTimeout(pending.expiresTimer);

    observability.observe("queue.waitMs", Math.max(0, now() - pending.enqueuedAt));
    activeQuestion = true;
    void answerQuestionWithTimeout(pending)
      .then(pending.resolve, pending.reject)
      .finally(() => {
        activeQuestion = false;
        pendingQuestionCount -= 1;
        resolveIdleWaiters();
        processNextQuestion();
      });
  };

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

    if (!acceptingQuestions) {
      await reply("The bot is shutting down. Please try again later.");
      return;
    }

    if (!isAiEnabled()) {
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

    if (pendingQuestionCount >= config.maxPendingQuestions) {
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
    pendingQuestionCount += 1;
    let queuedPosition: number | null = null;

    const responseTask = new Promise<void>((resolve, reject) => {
      if (activeQuestion) queuedPosition = pendingQuestions.length + 1;
      const pending: PendingQuestion = { enqueuedAt: now(), question, reply, resolve, reject };
      pending.expiresTimer = setTimeout(
        () => expirePendingQuestion(pending),
        questionQueueTimeoutMs,
      );
      pendingQuestions.push(pending);
      observability.increment("questions.accepted");
      observability.log("debug", "question.queued", { queueWaiting: pendingQuestions.length });
      processNextQuestion();
    });
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
    getQueueStatus: (): QuestionQueueStatus => ({
      active: activeQuestion,
      waiting: pendingQuestions.length,
    }),
    clearPendingQuestions: async (): Promise<number> => {
      const removedQuestions = pendingQuestions.splice(0);
      pendingQuestionCount -= removedQuestions.length;

      for (const { expiresTimer, resolve } of removedQuestions) {
        if (expiresTimer) clearTimeout(expiresTimer);
        resolve();
      }
      resolveIdleWaiters();

      await Promise.all(
        removedQuestions.map(async ({ reply }) => {
          await reply("Your question was removed from the queue by a moderator.");
        }),
      );

      observability.log("info", "queue.cleared", {
        outcome: "cleared",
        count: removedQuestions.length,
      });
      return removedQuestions.length;
    },
    stopAccepting: (): void => {
      acceptingQuestions = false;
      removePendingQuestions("The bot is shutting down; your queued question was not processed.");
    },
    waitForIdle,
  });
};

/**
 * Default question handler configured with the application's Gemini and queue settings.
 *
 * @param context Command arguments, author metadata, and chat reply function.
 * @returns A promise that resolves after the question is answered or rejected.
 */
export const questionCommand = createQuestionCommand();
