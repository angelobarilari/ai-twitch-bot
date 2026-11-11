import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

/**
 * Loads and validates the persisted response language.
 *
 * @param filePath Path to the response-language state file.
 * @param fallback Language to use when the state file does not exist.
 * @returns The normalized saved language or the fallback.
 * @throws If the file cannot be read, parsed, or validated.
 */
function readLanguage(filePath: string, fallback: string): string {
  let contents: string;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return fallback;

    throw new Error(`Failed to read response language from "${filePath}".`, { cause: error });
  }

  let state: unknown;
  try {
    state = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Response language state in "${filePath}" is not valid JSON.`, {
      cause: error,
    });
  }

  if (
    typeof state !== "object" ||
    state === null ||
    Array.isArray(state) ||
    !("language" in state) ||
    typeof state.language !== "string" ||
    !isValidResponseLanguage(state.language)
  ) {
    throw new Error(
      `Response language state in "${filePath}" must contain a valid "language" value.`,
    );
  }

  return normalizeResponseLanguage(state.language);
}

/**
 * Checks whether a response language is supported by the command and store.
 *
 * @param language Language name or the special value "auto".
 * @returns Whether the trimmed value is valid and within the supported length.
 */
export function isValidResponseLanguage(language: string): boolean {
  const normalized = language.trim();
  return (
    normalized.length > 0 &&
    normalized.length <= 40 &&
    (normalized.toLowerCase() === "auto" ||
      /^[\p{L}\p{M}][\p{L}\p{M}\p{Zs}().-]*$/u.test(normalized))
  );
}

/**
 * Trims a response language and normalizes the special auto-detect value.
 *
 * @param language Language name or the special value "auto".
 * @returns The trimmed language, with "auto" normalized to lowercase.
 */
export function normalizeResponseLanguage(language: string): string {
  const normalized = language.trim();
  return normalized.toLowerCase() === "auto" ? "auto" : normalized;
}

/**
 * Creates a response-language store with local persistence.
 *
 * @param filePath File used to load and save the selected language.
 * @param fallback Language used when no saved preference exists.
 * @returns Get and set operations for the selected response language.
 */
export function createResponseLanguageStore(
  filePath = process.env.AI_LANGUAGE_FILE?.trim() || join(process.cwd(), ".ai-language.json"),
  fallback = config.language,
): {
  get: () => string;
  set: (language: string) => void;
} {
  if (!isValidResponseLanguage(fallback)) {
    throw new Error("GEMINI_LANGUAGE must be 'auto' or a language name of at most 40 characters.");
  }
  let language = readLanguage(filePath, normalizeResponseLanguage(fallback));

  return {
    get: () => language,
    set: (value: string): void => {
      if (!isValidResponseLanguage(value)) {
        throw new Error(
          "Response language must be 'auto' or a language name of at most 40 characters.",
        );
      }

      const normalized = normalizeResponseLanguage(value);
      try {
        writeFileSync(filePath, `${JSON.stringify({ language: normalized })}\n`, "utf8");
      } catch (error) {
        throw new Error(`Failed to persist response language to "${filePath}".`, { cause: error });
      }

      language = normalized;
    },
  };
}

const responseLanguage = createResponseLanguageStore();

/** Returns the currently selected channel-wide response language. */
export const getResponseLanguage = responseLanguage.get;
/** Persists and selects a new channel-wide response language. */
export const setResponseLanguage = responseLanguage.set;
