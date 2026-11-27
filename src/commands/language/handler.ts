import type { CommandHandler } from "../../types/commands.js";
import type { StateStore } from "../../stores/types.js";
import type { Observability } from "../../observability/index.js";
import { normalizeChatText } from "../../safety/normalize-chat-text/index.js";
import { isSafeChatText } from "../../safety/is-safe-chat-text/index.js";
import { isValidResponseLanguage } from "../../utils/is-valid-response-language/index.js";
/**
 * Creates the !language handler without process configuration or global state.
 * @param languageStore Injected response language store.
 * @param observability Application telemetry.
 * @returns Command bound to the supplied application dependencies.
 */
export const createLanguageCommand =
  (languageStore: StateStore<string>, observability: Observability): CommandHandler =>
  async ({ args, reply }): Promise<void> => {
    if (args.length === 0) {
      await reply(
        `Current response language: ${languageStore.get()}. Use !language <language> or !language auto.`,
      );
      return;
    }

    const language = normalizeChatText(args.join(" "));
    if (!language || !isValidResponseLanguage(language) || !isSafeChatText(language)) {
      await reply("Usage: !language <language> or !language auto (maximum 40 characters).");
      return;
    }

    try {
      languageStore.set(language);
    } catch (error) {
      await reply("Could not save the response language; the previous setting was kept.");
      return;
    }

    const selectedLanguage = languageStore.get();
    observability.log("info", "settings.language.changed");
    await reply(
      selectedLanguage === "auto"
        ? "Responses will follow the language of each question."
        : `Response language set to ${selectedLanguage}.`,
    );
  };
