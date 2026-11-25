import type { CommandHandler } from "../../types/commands.js";
import { normalizeChatText } from "../../utils/normalize-chat-text/index.js";
import { isSafeChatText } from "../../utils/is-safe-chat-text/index.js";
import {
  getResponseLanguage,
  isValidResponseLanguage,
  setResponseLanguage,
} from "../../services/response-language.js";

/**
 * Handles the viewer-accessible !language command for the channel-wide response language.
 *
 * @param context Command arguments and chat reply function.
 * @returns A promise that resolves after the language setting is reported or updated.
 */
export const languageCommand: CommandHandler = async ({ args, reply }): Promise<void> => {
  if (args.length === 0) {
    await reply(
      `Current response language: ${getResponseLanguage()}. Use !language <language> or !language auto.`,
    );
    return;
  }

  const language = normalizeChatText(args.join(" "));
  if (!language || !isValidResponseLanguage(language) || !isSafeChatText(language)) {
    await reply("Usage: !language <language> or !language auto (maximum 40 characters).");
    return;
  }

  try {
    setResponseLanguage(language);
  } catch (error) {
    console.error("Failed to persist response language.");
    await reply("Could not save the response language; the previous setting was kept.");
    return;
  }

  const selectedLanguage = getResponseLanguage();
  console.info(JSON.stringify({ event: "settings.language.changed" }));
  await reply(
    selectedLanguage === "auto"
      ? "Responses will follow the language of each question."
      : `Response language set to ${selectedLanguage}.`,
  );
};
