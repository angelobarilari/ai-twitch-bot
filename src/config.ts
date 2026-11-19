import "dotenv/config";
import { isValidResponseLanguage } from "./utils/is-valid-response-language/index.js";

const requiredEnv = [
  "TWITCH_BOT_USERNAME",
  "TWITCH_OAUTH_TOKEN",
  "TWITCH_CHANNEL",
  "GEMINI_API_KEY",
] as const;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_QUESTION_LENGTH_CHARS = 500;
const MAX_ANSWER_LENGTH_CHARS = 2_000;
const MAX_PENDING_QUESTIONS_LIMIT = 100;

export type AppConfig = {
  username: string;
  token: string;
  channel: string;
  apiKey: string;
  model: string;
  language: string;
  geminiTimeoutMs: number;
  geminiMaxRetries: number;
  geminiRetryBaseDelayMs: number;
  questionTimeoutMs: number;
  questionQueueTimeoutMs: number;
  commandCooldownMs: number;
  userCooldownMs: number;
  maxQuestionLength: number;
  maxAnswerLength: number;
  maxPendingQuestions: number;
};

/**
 * Reads a required environment variable and trims surrounding whitespace.
 *
 * @param name Name of the environment variable.
 * @returns The non-empty environment variable value.
 * @throws If the variable is missing or contains only whitespace.
 */
const requireEnv = (name: string): string => {
  const value = process.env[name];

  if (!value || !value.trim()) throw new Error(`Required environment variable is missing: ${name}`);

  return value.trim();
};

/**
 * Parses a positive finite numeric setting from an environment variable.
 *
 * @param name Name of the setting, used in validation errors.
 * @param value Raw environment variable value.
 * @param fallback Default value when the environment variable is unset or blank.
 * @returns The parsed positive finite number.
 * @throws If the value is not a positive finite number.
 */
const parsePositiveFiniteNumber = (
  name: string,
  value: string | undefined,
  fallback: number,
): number => {
  const rawValue = value?.trim();
  const candidate = rawValue === undefined || rawValue === "" ? String(fallback) : rawValue;
  const parsed = Number(candidate);

  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive finite number.`);

  return parsed;
};

/**
 * Parses a positive safe integer setting from an environment variable.
 *
 * @param name Name of the setting, used in validation errors.
 * @param value Raw environment variable value.
 * @param fallback Default value when the environment variable is unset or blank.
 * @param maximum Largest accepted value.
 * @returns The parsed positive safe integer.
 * @throws If the value is not a positive safe integer or exceeds the maximum.
 */
const parsePositiveSafeInteger = (
  name: string,
  value: string | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  const rawValue = value?.trim();
  const candidate = rawValue === undefined || rawValue === "" ? String(fallback) : rawValue;
  const parsed = Number(candidate);

  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be a positive safe integer no greater than ${maximum}.`);
  }

  return parsed;
};

/**
 * Parses a non-negative safe integer setting from an environment variable.
 *
 * @param name Name of the setting, used in validation errors.
 * @param value Raw environment variable value.
 * @param fallback Default value when the environment variable is unset or blank.
 * @returns The parsed non-negative safe integer.
 * @throws If the value is not a non-negative safe integer.
 */
const parseNonNegativeSafeInteger = (
  name: string,
  value: string | undefined,
  fallback: number,
): number => {
  const rawValue = value?.trim();
  const candidate = rawValue === undefined || rawValue === "" ? String(fallback) : rawValue;
  const parsed = Number(candidate);

  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error(`${name} must be a non-negative safe integer.`);

  return parsed;
};

/**
 * Parses a cooldown in seconds and converts it to a safe millisecond duration.
 *
 * @param name Name of the setting, used in validation errors.
 * @param value Raw environment variable value.
 * @param fallback Default cooldown in seconds when the value is unset or blank.
 * @returns The cooldown duration in milliseconds.
 * @throws If the value does not convert to a positive safe integer duration.
 */
const parseCooldownMilliseconds = (
  name: string,
  value: string | undefined,
  fallback: number,
): number => {
  const milliseconds = parsePositiveFiniteNumber(name, value, fallback) * 1000;
  if (!Number.isSafeInteger(milliseconds)) {
    throw new Error(`${name} must result in a positive safe millisecond duration.`);
  }
  return milliseconds;
};

/**
 * Loads and validates application settings from the environment.
 *
 * @returns The normalized Twitch, Gemini, cooldown, and queue configuration.
 * @throws If required variables or setting values are invalid.
 */
export const loadConfig = (): AppConfig => {
  const username = requireEnv("TWITCH_BOT_USERNAME");
  if (!/^[a-z0-9_]{1,25}$/i.test(username)) {
    throw new Error("TWITCH_BOT_USERNAME must be a valid Twitch username.");
  }

  const token = requireEnv("TWITCH_OAUTH_TOKEN");
  if (!/^oauth:\S+$/i.test(token)) {
    throw new Error("TWITCH_OAUTH_TOKEN must use the oauth:<token> format.");
  }

  const channel = requireEnv("TWITCH_CHANNEL").replace(/^#/, "").toLowerCase();

  if (!/^[a-z0-9_][a-z0-9_]{0,24}$/.test(channel)) {
    throw new Error("TWITCH_CHANNEL must be a valid Twitch channel name.");
  }

  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    throw new Error(
      "GEMINI_MODEL must contain only letters, numbers, dots, underscores, or hyphens.",
    );
  }

  const language = process.env.GEMINI_LANGUAGE?.trim() || "auto";
  if (!isValidResponseLanguage(language)) {
    throw new Error(
      "GEMINI_LANGUAGE must be 'auto' or a valid language name of at most 40 characters.",
    );
  }

  const geminiTimeoutMs = parsePositiveSafeInteger(
    "GEMINI_TIMEOUT_MS",
    process.env.GEMINI_TIMEOUT_MS,
    10_000,
  );
  const geminiMaxRetries = parseNonNegativeSafeInteger(
    "GEMINI_MAX_RETRIES",
    process.env.GEMINI_MAX_RETRIES,
    1,
  );
  const geminiRetryBaseDelayMs = parseNonNegativeSafeInteger(
    "GEMINI_RETRY_BASE_DELAY_MS",
    process.env.GEMINI_RETRY_BASE_DELAY_MS,
    250,
  );
  if (
    geminiTimeoutMs > MAX_TIMER_DELAY_MS ||
    geminiRetryBaseDelayMs > 60_000 ||
    geminiMaxRetries > 5
  ) {
    throw new Error(
      "Gemini timeout, retry count, or retry delay exceeds the supported operational limit.",
    );
  }

  const questionTimeoutMs = parsePositiveSafeInteger(
    "QUESTION_TIMEOUT_MS",
    process.env.QUESTION_TIMEOUT_MS,
    45_000,
  );
  const questionQueueTimeoutMs = parsePositiveSafeInteger(
    "QUESTION_QUEUE_TIMEOUT_MS",
    process.env.QUESTION_QUEUE_TIMEOUT_MS,
    120_000,
  );
  if (questionTimeoutMs > MAX_TIMER_DELAY_MS || questionQueueTimeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error("Question timeout values exceed the supported timer limit.");
  }

  let maxGeminiRequestDurationMs = geminiTimeoutMs * (geminiMaxRetries + 1);
  for (let retry = 0; retry < geminiMaxRetries; retry += 1) {
    maxGeminiRequestDurationMs += geminiRetryBaseDelayMs * 2 ** retry;
  }
  if (
    !Number.isSafeInteger(maxGeminiRequestDurationMs) ||
    maxGeminiRequestDurationMs * 2 > questionTimeoutMs
  ) {
    throw new Error(
      "QUESTION_TIMEOUT_MS must allow two Gemini requests with the configured retries and delays.",
    );
  }

  return {
    username,
    token,
    channel,
    apiKey: requireEnv("GEMINI_API_KEY"),
    model,
    language,
    geminiTimeoutMs,
    geminiMaxRetries,
    geminiRetryBaseDelayMs,
    questionTimeoutMs,
    questionQueueTimeoutMs,
    commandCooldownMs: parseCooldownMilliseconds(
      "COMMAND_COOLDOWN_SECONDS",
      process.env.COMMAND_COOLDOWN_SECONDS,
      15,
    ),
    userCooldownMs: parseCooldownMilliseconds(
      "USER_COOLDOWN_SECONDS",
      process.env.USER_COOLDOWN_SECONDS,
      30,
    ),
    maxQuestionLength: parsePositiveSafeInteger(
      "MAX_QUESTION_LENGTH",
      process.env.MAX_QUESTION_LENGTH,
      300,
      MAX_QUESTION_LENGTH_CHARS,
    ),
    maxAnswerLength: parsePositiveSafeInteger(
      "MAX_ANSWER_LENGTH",
      process.env.MAX_ANSWER_LENGTH,
      420,
      MAX_ANSWER_LENGTH_CHARS,
    ),
    maxPendingQuestions: parsePositiveSafeInteger(
      "MAX_PENDING_QUESTIONS",
      process.env.MAX_PENDING_QUESTIONS,
      5,
      MAX_PENDING_QUESTIONS_LIMIT,
    ),
  };
};

for (const name of requiredEnv) requireEnv(name);

export const config = loadConfig();
