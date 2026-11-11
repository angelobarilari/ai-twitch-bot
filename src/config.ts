import "dotenv/config";

const requiredEnv = [
  "TWITCH_BOT_USERNAME",
  "TWITCH_OAUTH_TOKEN",
  "TWITCH_CHANNEL",
  "GEMINI_API_KEY",
] as const;

/**
 * Reads a required environment variable and trims surrounding whitespace.
 *
 * @param name Name of the environment variable.
 * @returns The non-empty environment variable value.
 * @throws If the variable is missing or contains only whitespace.
 */
function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || !value.trim()) throw new Error(`Required environment variable is missing: ${name}`);

  return value.trim();
}

/**
 * Parses a positive finite numeric setting from an environment variable.
 *
 * @param name Name of the setting, used in validation errors.
 * @param value Raw environment variable value.
 * @param fallback Default value when the environment variable is unset or blank.
 * @returns The parsed positive finite number.
 * @throws If the value is not a positive finite number.
 */
function parsePositiveInteger(name: string, value: string | undefined, fallback: number): number {
  const rawValue = value?.trim();
  const candidate = rawValue === undefined || rawValue === "" ? String(fallback) : rawValue;
  const parsed = Number(candidate);

  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive finite number.`);

  return parsed;
}

/**
 * Parses a positive safe integer setting from an environment variable.
 *
 * @param name Name of the setting, used in validation errors.
 * @param value Raw environment variable value.
 * @param fallback Default value when the environment variable is unset or blank.
 * @returns The parsed positive safe integer.
 * @throws If the value is not a positive safe integer.
 */
function parsePositiveSafeInteger(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  const rawValue = value?.trim();
  const candidate = rawValue === undefined || rawValue === "" ? String(fallback) : rawValue;
  const parsed = Number(candidate);

  if (!Number.isSafeInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive safe integer.`);

  return parsed;
}

/**
 * Loads and validates application settings from the environment.
 *
 * @returns The normalized Twitch, Gemini, cooldown, and queue configuration.
 * @throws If required variables or setting values are invalid.
 */
export function loadConfig() {
  const channel = requireEnv("TWITCH_CHANNEL").replace(/^#/, "").toLowerCase();

  if (!/^[a-z0-9_][a-z0-9_]{0,24}$/.test(channel)) {
    throw new Error("TWITCH_CHANNEL must be a valid Twitch channel name.");
  }

  return {
    username: requireEnv("TWITCH_BOT_USERNAME"),
    token: requireEnv("TWITCH_OAUTH_TOKEN"),
    channel,
    apiKey: requireEnv("GEMINI_API_KEY"),
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    language: process.env.GEMINI_LANGUAGE?.trim() || "auto",
    commandCooldownMs:
      parsePositiveInteger("COMMAND_COOLDOWN_SECONDS", process.env.COMMAND_COOLDOWN_SECONDS, 15) *
      1000,
    userCooldownMs:
      parsePositiveInteger("USER_COOLDOWN_SECONDS", process.env.USER_COOLDOWN_SECONDS, 30) * 1000,
    maxQuestionLength: parsePositiveInteger(
      "MAX_QUESTION_LENGTH",
      process.env.MAX_QUESTION_LENGTH,
      300,
    ),
    maxAnswerLength: parsePositiveInteger("MAX_ANSWER_LENGTH", process.env.MAX_ANSWER_LENGTH, 420),
    maxPendingQuestions: parsePositiveSafeInteger(
      "MAX_PENDING_QUESTIONS",
      process.env.MAX_PENDING_QUESTIONS,
      5,
    ),
  };
}

for (const name of requiredEnv) requireEnv(name);

export const config = loadConfig();
