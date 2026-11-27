import type { StateStore } from "./types.js";
import { observability, type Observability } from "../observability/index.js";
import { join, resolve } from "node:path";
import {
  MAX_STATE_FILE_BYTES,
  readUtf8FileWithLimit,
} from "../utils/read-utf8-file-with-limit/index.js";
import { isValidResponseLanguage } from "../utils/is-valid-response-language/index.js";
import { normalizeResponseLanguage } from "../utils/normalize-response-language/index.js";
import { writeUtf8FileAtomically } from "../utils/write-utf8-file-atomically/index.js";

export { isValidResponseLanguage } from "../utils/is-valid-response-language/index.js";
export { normalizeResponseLanguage } from "../utils/normalize-response-language/index.js";

/**
 * Loads and validates the persisted response language.
 *
 * @param filePath Path to the response-language state file.
 * @returns The normalized saved language, or undefined when the file does not exist.
 * @throws If the file cannot be read, parsed, or validated.
 */
const readLanguage = (filePath: string): string | undefined => {
  let contents: string;
  try {
    contents = readUtf8FileWithLimit(filePath, MAX_STATE_FILE_BYTES);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
      return undefined;

    throw new Error(`Failed to read response language from "${filePath}".`, { cause: error });
  }

  let state: unknown;
  try {
    state = JSON.parse(contents);
  } catch {
    // Keep malformed persisted content out of startup error output.
    throw new Error(`Response language state in "${filePath}" is not valid JSON.`);
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
};

/**
 * Creates a response-language store with local persistence.
 *
 * @param filePath File used to load and save the selected language.
 * @param fallback Language used when no saved preference exists.
 * @param telemetry Telemetry instance for this application.
 * @param environment Explicit persistence path configuration.
 * @returns Get and set operations for the selected response language.
 * @throws If the fallback is invalid or persisted state cannot be read or validated.
 */
export const createResponseLanguageStore = (
  filePath?: string,
  fallback = "auto",
  telemetry: Observability = observability,
  environment: NodeJS.ProcessEnv = {},
): StateStore<string> => {
  if (!isValidResponseLanguage(fallback)) {
    throw new Error("GEMINI_LANGUAGE must be 'auto' or a language name of at most 40 characters.");
  }

  const defaultFilePath = join(process.cwd(), ".data", "ai-language.json");
  const legacyDefaultFilePath = join(process.cwd(), ".ai-language.json");
  const configuredFilePath = environment.AI_LANGUAGE_FILE?.trim();
  const resolvedFilePath = resolve(filePath ?? (configuredFilePath || defaultFilePath));
  const canMigrateLegacyFile = resolvedFilePath === defaultFilePath;
  let language = readLanguage(resolvedFilePath);

  if (language === undefined && canMigrateLegacyFile) {
    language = readLanguage(legacyDefaultFilePath);
    if (language !== undefined) {
      try {
        writeUtf8FileAtomically(resolvedFilePath, `${JSON.stringify({ language })}\n`);
      } catch (error) {
        throw new Error(`Failed to migrate response language to "${resolvedFilePath}".`, {
          cause: error,
        });
      }
    }
  }
  let currentLanguage = language ?? normalizeResponseLanguage(fallback);

  telemetry.setHealth("language", "ready");
  return {
    /**
     * Returns the current in-memory response language.
     *
     * @returns The selected response language.
     */
    get: () => currentLanguage,
    /**
     * Persists a valid language before updating the in-memory value.
     *
     * @param value Language name or the special "auto" setting.
     * @returns Nothing.
     * @throws If the value is invalid or persistence fails.
     */
    set: (value: string): void => {
      if (!isValidResponseLanguage(value)) {
        throw new Error(
          "Response language must be 'auto' or a language name of at most 40 characters.",
        );
      }

      const normalized = normalizeResponseLanguage(value);
      try {
        writeUtf8FileAtomically(resolvedFilePath, `${JSON.stringify({ language: normalized })}\n`);
      } catch (error) {
        telemetry.setHealth("language", "degraded");
        telemetry.log("error", "persistence.write", {
          outcome: "error",
          category: "operational",
        });
        throw new Error(`Failed to persist response language to "${resolvedFilePath}".`, {
          cause: error,
        });
      }

      currentLanguage = normalized;
      telemetry.setHealth("language", "ready");
      telemetry.log("info", "persistence.write", { outcome: "success" });
    },
  };
};
