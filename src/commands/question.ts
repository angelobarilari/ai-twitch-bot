import { config } from "../config.js";
import { askGemini } from "../services/gemini.js";
import { blockedContent, remainingSeconds, splitForTwitch } from "../utils/chat.js";
import type { CommandHandler } from "../types/commands.js";
import { isAiEnabled } from "./ai-state.js";

export type QuestionQueueStatus = {
  active: boolean;
  waiting: number;
};

type PendingQuestion = {
  question: string;
  reply: (message: string) => Promise<unknown>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

export type ManagedQuestionCommand = CommandHandler & {
  getQueueStatus: () => QuestionQueueStatus;
  clearPendingQuestions: () => Promise<number>;
};

/**
 * Creates a !question command handler with isolated cooldowns and response queue.
 *
 * @param askQuestion Gemini request function.
 * @param now Clock used to evaluate cooldowns.
 * @returns A command handler that serializes accepted Gemini requests.
 */
export function createQuestionCommand(
  askQuestion: typeof askGemini = askGemini,
  now: () => number = Date.now,
): ManagedQuestionCommand {
  const lastCommandAt = new Map<string, number>();
  let lastGlobalCommandAt = 0;
  let pendingQuestionCount = 0;
  let activeQuestion = false;
  const pendingQuestions: PendingQuestion[] = [];

  async function answerQuestion(question: string, reply: PendingQuestion["reply"]): Promise<void> {
    try {
      let answer = await askQuestion(question);
      if (!answer || blockedContent.test(answer)) {
        await reply("The AI could not generate a safe answer for that question.");
        return;
      }

      if (answer.length > config.maxAnswerLength) {
        answer = await askQuestion(
          [
            `Rewrite the draft as a complete, self-contained answer to the original question in no more than ${config.maxAnswerLength} characters.`,
            "Preserve the essential context, use complete sentences, and do not end with an ellipsis or an unfinished thought.",
            `Original question: ${question}`,
            `Draft answer: ${answer}`,
          ].join("\n"),
        );
      }

      if (!answer || blockedContent.test(answer)) {
        await reply("The AI could not generate a safe answer for that question.");
        return;
      }

      if (answer.length > config.maxAnswerLength) {
        await reply(
          "I could not provide a complete answer within the chat limit. Please try a shorter question.",
        );
        return;
      }

      for (const chunk of splitForTwitch(answer, 430)) {
        await reply(chunk);
      }
    } catch (error) {
      console.error("Error while querying the AI:", error);
      await reply("I could not query the AI right now. Please try again later.");
    }
  }

  function processNextQuestion(): void {
    if (activeQuestion) return;

    const pending = pendingQuestions.shift();
    if (!pending) return;

    activeQuestion = true;
    void answerQuestion(pending.question, pending.reply)
      .then(pending.resolve, pending.reject)
      .finally(() => {
        activeQuestion = false;
        pendingQuestionCount -= 1;
        processNextQuestion();
      });
  }

  const command: CommandHandler = async (context): Promise<void> => {
    const { args, reply, tags, text } = context;
    const username = tags.username ?? "anonymous";
    const question = text || args.join(" ");
    const currentTime = now();

    if (!isAiEnabled()) {
      await reply("A IA está desligada no momento.");
      return;
    }

    if (!question) {
      await reply("Usage: !question your question");
      return;
    }

    if (question.length > config.maxQuestionLength) {
      await reply(`Your question must be at most ${config.maxQuestionLength} characters long.`);
      return;
    }

    if (blockedContent.test(question)) {
      await reply("I cannot process that type of question.");
      return;
    }

    const userAvailableAt = (lastCommandAt.get(username) ?? 0) + config.userCooldownMs;
    const globalAvailableAt = lastGlobalCommandAt + config.commandCooldownMs;
    if (currentTime < userAvailableAt) {
      await reply(`@${username}, please wait ${remainingSeconds(userAvailableAt, currentTime)}s.`);
      return;
    }

    if (currentTime < globalAvailableAt) {
      await reply(
        `Please wait ${remainingSeconds(globalAvailableAt, currentTime)}s before the next question.`,
      );
      return;
    }

    if (pendingQuestionCount >= config.maxPendingQuestions) {
      await reply("The AI question queue is full. Please try again later.");
      return;
    }

    lastCommandAt.set(username, currentTime);
    lastGlobalCommandAt = currentTime;
    pendingQuestionCount += 1;

    const responseTask = new Promise<void>((resolve, reject) => {
      pendingQuestions.push({ question, reply, resolve, reject });
      processNextQuestion();
    });

    await responseTask;
  };

  return Object.assign(command, {
    getQueueStatus: (): QuestionQueueStatus => ({
      active: activeQuestion,
      waiting: pendingQuestions.length,
    }),
    clearPendingQuestions: async (): Promise<number> => {
      const removedQuestions = pendingQuestions.splice(0);
      pendingQuestionCount -= removedQuestions.length;

      await Promise.all(
        removedQuestions.map(async ({ resolve, reply }) => {
          resolve();
          await reply("Sua pergunta foi removida da fila por um moderador.");
        }),
      );

      return removedQuestions.length;
    },
  });
}

export const questionCommand = createQuestionCommand();
