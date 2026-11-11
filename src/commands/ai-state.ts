import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type PersistedAiState = {
  enabled: boolean;
};

/**
 * Reads the persisted AI state, defaulting to enabled when no file exists.
 *
 * @param filePath Path to the AI-state file.
 * @returns Whether AI responses are enabled.
 * @throws If the file cannot be read, parsed, or validated.
 */
function readEnabled(filePath: string): boolean {
  let contents: string;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return true;
    }

    throw new Error(`Failed to read persisted AI state from "${filePath}".`, { cause: error });
  }

  let state: unknown;
  try {
    state = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Persisted AI state in "${filePath}" is not valid JSON.`, { cause: error });
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
}

/**
 * Creates a state store that persists the AI enabled flag between process runs.
 *
 * @param filePath File used to read and persist the enabled state.
 * @returns State accessors bound to the persistence file.
 */
export function createAiStateStore(
  filePath = process.env.AI_STATE_FILE ?? join(process.cwd(), ".ai-state.json"),
): {
  isEnabled: () => boolean;
  setEnabled: (value: boolean) => void;
} {
  let enabled = readEnabled(filePath);

  return {
    isEnabled: () => enabled,
    setEnabled: (value: boolean): void => {
      try {
        writeFileSync(filePath, `${JSON.stringify({ enabled: value })}\n`, "utf8");
      } catch (error) {
        throw new Error(`Failed to persist AI state to "${filePath}".`, { cause: error });
      }

      enabled = value;
    },
  };
}

const aiState = createAiStateStore();

/** Returns whether AI responses are currently enabled. */
export const isAiEnabled = aiState.isEnabled;
/** Persists whether AI responses are enabled. */
export const setAiEnabled = aiState.setEnabled;
