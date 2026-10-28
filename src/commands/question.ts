import { config } from "../config.js";
import { askGemini } from "../services/gemini.js";
import { blockedContent, remainingSeconds, splitForTwitch } from "../utils/chat.js";
import type { CommandHandler } from "../types/commands.js";

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
): CommandHandler {
  const lastCommandAt = new Map<string, number>();
  let lastGlobalCommandAt = 0;
  let pendingQuestionCount = 0;
  let pendingResponses: Promise<void> = Promise.resolve();

  return async (context): Promise<void> => {
    const { args, reply, tags, text } = context;
    const username = tags.username ?? "anonymous";
    const question = text || args.join(" ");
    const currentTime = now();

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

    const responseTask = pendingResponses
      .then(async () => {
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
      })
      .finally(() => {
        pendingQuestionCount -= 1;
      });

    pendingResponses = responseTask.catch(() => {});
    await responseTask;
  };
}

export const questionCommand = createQuestionCommand();
