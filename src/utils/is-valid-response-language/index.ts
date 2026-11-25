/**
 * Checks whether a response-language setting is a supported language name.
 *
 * @param language Language name or the special "auto" setting.
 * @returns Whether the trimmed value is valid and no longer than 40 characters.
 */
export const isValidResponseLanguage = (language: string): boolean => {
  const normalized = language.trim();
  return (
    normalized.length > 0 &&
    normalized.length <= 40 &&
    isSafeChatText(normalized) &&
    (normalized.toLowerCase() === "auto" ||
      /^[\p{L}\p{M}][\p{L}\p{M}\p{Zs}().-]*$/u.test(normalized))
  );
};
import { isSafeChatText } from "../is-safe-chat-text/index.js";
