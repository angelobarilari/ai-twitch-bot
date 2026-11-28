import type { AskOptions, AiProvider } from "./types.js";
import type { AppConfig } from "../config/validate.js";
import type { Observability } from "../observability/index.js";
import type { QuestionOutcome } from "../queue/question-queue.js";
import { normalizeChatText } from "../safety/normalize-chat-text/index.js";
import { isSafeChatText } from "../safety/is-safe-chat-text/index.js";
import { splitForTwitch } from "../utils/split-for-twitch/index.js";

/**
 * Binds provider-independent answer validation and chat delivery.
 * @param provider AI implementation selected by the application.
 * @param config Response limits and secrets to exclude from output.
 * @param observability Application telemetry without chat text.
 * @returns Answer operation accepting a question, reply callback, and cancellation signal.
 */
export const createAnswerHandler = (
  provider: AiProvider,
  config: Pick<AppConfig, "apiKey" | "token" | "maxAnswerLength">,
  observability: Observability,
) => {
  /**
   * Obtains and validates an answer, then sends it through Twitch chat.
   *
   * @param question Question text to send to Gemini.
   * @param reply Reply function for the originating chat channel.
   * @param signal Cancellation signal for the active question deadline.
   * @param requestOptions Trusted generation options and bounded untrusted history.
   * @param onDelivered Callback after a safe answer is fully delivered.
   * @returns A promise that resolves after the answer or an error message is sent.
   */
  return async (
    question: string,
    reply: (message: string) => Promise<unknown>,
    signal: AbortSignal,
    requestOptions: AskOptions = {},
    onDelivered?: (answer: string) => void,
  ): Promise<QuestionOutcome> => {
    try {
      const generated = await provider.ask(question, { ...requestOptions, signal });
      let answer = normalizeChatText(generated ?? "");
      if (signal.aborted) return "cancelled";
      if (!answer || !isSafeChatText(answer, [config.apiKey, config.token])) {
        await reply("The AI could not generate a safe answer for that question.");
        return generated === null ? "error" : "unsafe";
      }

      if (Array.from(answer).length > config.maxAnswerLength) {
        answer = normalizeChatText(
          (await provider.ask(question, { ...requestOptions, signal, concise: true })) ?? "",
        );
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
      if (signal.aborted) return "cancelled";
      onDelivered?.(answer);
      observability.observe("answers.characters", Array.from(answer).length);
      return "success";
    } catch (error) {
      if (signal.aborted) return "cancelled";
      await reply("I could not query the AI right now. Please try again later.");
      return "error";
    }
  };
};
