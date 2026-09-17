import { config } from "../config.js";
import { askGemini } from "../services/gemini.js";
import { blockedContent, remainingSeconds, splitForTwitch } from "../utils/chat.js";
import type { CommandHandler } from "./types.js";

const lastCommandAt = new Map<string, number>();
let lastGlobalCommandAt = 0;

/**
 * Handles the !question command.
 *
 * @param context Command context containing the user's question and chat reply function.
 * @returns A promise that resolves after validation, AI lookup, and response delivery finish.
 */
export const questionCommand: CommandHandler = async (context): Promise<void> => {
  const { args, reply, tags, text } = context;
  const username = tags.username ?? "anonymous";
  const question = text || args.join(" ");
  const now = Date.now();

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
  if (now < userAvailableAt) {
    await reply(`@${username}, please wait ${remainingSeconds(userAvailableAt, now)}s.`);
    return;
  }
  
  if (now < globalAvailableAt) {
    await reply(`Please wait ${remainingSeconds(globalAvailableAt, now)}s before the next question.`);
    return;
  }

  lastCommandAt.set(username, now);
  lastGlobalCommandAt = now;

  try {
    const answer = await askGemini(question);
    if (!answer || blockedContent.test(answer)) {
      await reply("The AI could not generate a safe answer for that question.");
      return;
    }

    for (const chunk of splitForTwitch(answer.slice(0, config.maxAnswerLength), 430)) {
      await reply(chunk);
    }
  } catch (error) {
    console.error("Error while querying the AI:", error);
    await reply("I could not query the AI right now. Please try again later.");
  }
};
