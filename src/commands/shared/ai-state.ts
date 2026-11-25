import "dotenv/config";
import { join, resolve } from "node:path";
import {
  MAX_STATE_FILE_BYTES,
  readUtf8FileWithLimit,
} from "../../utils/read-utf8-file-with-limit/index.js";
import { writeUtf8FileAtomically } from "../../utils/write-utf8-file-atomically/index.js";

/**
 * Reads the persisted AI state, defaulting to enabled when no file exists.
 *
 * @param filePath Path to the AI-state file.
 * @returns Whether AI responses are enabled.
 * @throws If the file cannot be read, parsed, or validated.
 */
const readEnabled = (filePath: string): boolean | undefined => {
  let contents: string;
  try {
    contents = readUtf8FileWithLimit(filePath, MAX_STATE_FILE_BYTES);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw new Error(`Failed to read persisted AI state from "${filePath}".`, { cause: error });
  }

  let state: unknown;
  try {
    state = JSON.parse(contents);
  } catch {
    // JSON parser errors can include the persisted payload in their message.
    throw new Error(`Persisted AI state in "${filePath}" is not valid JSON.`);
  }

  if (
    typeof state !== "object" ||
    state === null ||
    Array.isArray(state) ||
    !("enabled" in state) ||
    typeof state.enabled !== "boolean"
  ) {
    throw new Error(`Persisted AI state in "${filePath}" must contain a boolean "enabled" value.`);
  }

  return state.enabled;
};

/**
 * Creates a state store that persists the AI enabled flag between process runs.
 *
 * @param filePath File used to read and persist the enabled state.
 * @returns State accessors bound to the persistence file.
 * @throws If persisted state cannot be read, parsed, or validated.
 */
export const createAiStateStore = (
  filePath?: string,
): {
  isEnabled: () => boolean;
  setEnabled: (value: boolean) => void;
} => {
  const defaultFilePath = join(process.cwd(), ".data", "ai-state.json");
  const legacyDefaultFilePath = join(process.cwd(), ".ai-state.json");
  const configuredFilePath = process.env.AI_STATE_FILE?.trim();
  const resolvedFilePath = resolve(filePath ?? (configuredFilePath || defaultFilePath));
  const canMigrateLegacyFile = resolvedFilePath === defaultFilePath;
  let enabled = readEnabled(resolvedFilePath);

  if (enabled === undefined && canMigrateLegacyFile) {
    enabled = readEnabled(legacyDefaultFilePath);
    if (enabled !== undefined) {
      try {
        writeUtf8FileAtomically(resolvedFilePath, `${JSON.stringify({ enabled })}\n`);
      } catch (error) {
        throw new Error(`Failed to migrate persisted AI state to "${resolvedFilePath}".`, {
          cause: error,
        });
      }
    }
  }
  let currentEnabled = enabled ?? true;

  return {
    /**
     * Returns the current in-memory AI enabled state.
     *
     * @returns Whether AI responses are enabled.
     */
    isEnabled: () => currentEnabled,
    /**
     * Persists the AI state before updating the in-memory value.
     *
     * @param value Whether AI responses should be enabled.
     * @returns Nothing.
     * @throws If the state cannot be persisted.
     */
    setEnabled: (value: boolean): void => {
      try {
        writeUtf8FileAtomically(resolvedFilePath, `${JSON.stringify({ enabled: value })}\n`);
      } catch (error) {
        throw new Error(`Failed to persist AI state to "${resolvedFilePath}".`, { cause: error });
      }

      currentEnabled = value;
    },
  };
};

const aiState = createAiStateStore();

/**
 * Returns whether AI responses are currently enabled.
 *
 * @returns Whether AI responses are enabled.
 */
export const isAiEnabled = aiState.isEnabled;
/**
 * Persists whether AI responses are enabled.
 *
 * @param value Whether AI responses should be enabled.
 * @returns Nothing.
 */
export const setAiEnabled = aiState.setEnabled;
