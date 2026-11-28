import { isPersona, isResponseMode, type Persona, type ResponseMode } from "../ai/profiles.js";
import { isValidResponseLanguage } from "../utils/is-valid-response-language/index.js";

const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_QUESTION_LENGTH_CHARS = 500;
const MAX_ANSWER_LENGTH_CHARS = 2_000;
const MAX_PENDING_QUESTIONS_LIMIT = 100;

export type AppConfig = {
  responseMode: ResponseMode;
  persona: Persona;
  personaFile?: string;
  memoryFile: string;
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
  questionAccess: "everyone" | "known" | "subscriber" | "moderator" | "broadcaster";
  questionWindowMs: number;
  maxQuestionsPerWindow: number;
  abusePenaltyMs: number;
  abuseBanMs: number;
  abuseMaxStrikes: number;
};

/**
 * Reads a required environment variable and trims surrounding whitespace.
 *
 * @param name Name of the environment variable.
 * @param environment Explicit environment values to validate.
 * @returns The non-empty environment variable value.
 * @throws If the variable is missing or contains only whitespace.
 */
const requireEnv = (name: string, environment: NodeJS.ProcessEnv): string => {
  const value = environment[name];

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
 * @param environment Explicit environment values; does not load dotenv or access secrets implicitly.
 * @returns The normalized Twitch, Gemini, cooldown, and queue configuration.
 * @throws If required variables or setting values are invalid.
 */
export const loadConfig = (environment: NodeJS.ProcessEnv): AppConfig => {
  const responseMode = environment.AI_RESPONSE_MODE?.trim() || "concise";
  const persona = environment.BOT_PERSONA?.trim() || "assistant";
  if (!isResponseMode(responseMode))
    throw new Error("AI_RESPONSE_MODE must be concise, detailed, or educational.");
  if (!isPersona(persona))
    throw new Error("BOT_PERSONA must be assistant, tutor, commentator, or technical.");
  const questionAccess = environment.QUESTION_ACCESS?.trim() || "everyone";
  if (!["everyone", "known", "subscriber", "moderator", "broadcaster"].includes(questionAccess)) {
    throw new Error(
      "QUESTION_ACCESS must be everyone, known, subscriber, moderator, or broadcaster.",
    );
  }
  const username = requireEnv("TWITCH_BOT_USERNAME", environment);
  if (!/^[a-z0-9_]{1,25}$/i.test(username)) {
    throw new Error("TWITCH_BOT_USERNAME must be a valid Twitch username.");
  }

  const token = requireEnv("TWITCH_OAUTH_TOKEN", environment);
  if (!/^oauth:\S+$/i.test(token)) {
    throw new Error("TWITCH_OAUTH_TOKEN must use the oauth:<token> format.");
  }

  const channel = requireEnv("TWITCH_CHANNEL", environment).replace(/^#/, "").toLowerCase();

  if (!/^[a-z0-9_][a-z0-9_]{0,24}$/.test(channel)) {
    throw new Error("TWITCH_CHANNEL must be a valid Twitch channel name.");
  }

  const model = environment.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
    throw new Error(
      "GEMINI_MODEL must contain only letters, numbers, dots, underscores, or hyphens.",
    );
  }

  const language = environment.GEMINI_LANGUAGE?.trim() || "auto";
  if (!isValidResponseLanguage(language)) {
    throw new Error(
      "GEMINI_LANGUAGE must be 'auto' or a valid language name of at most 40 characters.",
    );
  }

  const geminiTimeoutMs = parsePositiveSafeInteger(
    "GEMINI_TIMEOUT_MS",
    environment.GEMINI_TIMEOUT_MS,
    10_000,
  );
  const geminiMaxRetries = parseNonNegativeSafeInteger(
    "GEMINI_MAX_RETRIES",
    environment.GEMINI_MAX_RETRIES,
    1,
  );
  const geminiRetryBaseDelayMs = parseNonNegativeSafeInteger(
    "GEMINI_RETRY_BASE_DELAY_MS",
    environment.GEMINI_RETRY_BASE_DELAY_MS,
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
    environment.QUESTION_TIMEOUT_MS,
    45_000,
  );
  const questionQueueTimeoutMs = parsePositiveSafeInteger(
    "QUESTION_QUEUE_TIMEOUT_MS",
    environment.QUESTION_QUEUE_TIMEOUT_MS,
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
    memoryFile: environment.CHANNEL_MEMORY_FILE?.trim() || ".data/channel-memory.json",
    responseMode,
    persona,
    personaFile: environment.BOT_PERSONA_FILE?.trim() || undefined,
    questionAccess: questionAccess as AppConfig["questionAccess"],
    questionWindowMs: parsePositiveSafeInteger(
      "QUESTION_WINDOW_MS",
      environment.QUESTION_WINDOW_MS,
      60_000,
      MAX_TIMER_DELAY_MS,
    ),
    maxQuestionsPerWindow: parsePositiveSafeInteger(
      "MAX_QUESTIONS_PER_WINDOW",
      environment.MAX_QUESTIONS_PER_WINDOW,
      5,
      100,
    ),
    abusePenaltyMs: parsePositiveSafeInteger(
      "ABUSE_PENALTY_MS",
      environment.ABUSE_PENALTY_MS,
      1_000,
      MAX_TIMER_DELAY_MS,
    ),
    abuseBanMs: parsePositiveSafeInteger(
      "ABUSE_BAN_MS",
      environment.ABUSE_BAN_MS,
      300_000,
      MAX_TIMER_DELAY_MS,
    ),
    abuseMaxStrikes: parsePositiveSafeInteger(
      "ABUSE_MAX_STRIKES",
      environment.ABUSE_MAX_STRIKES,
      3,
      20,
    ),
    username,
    token,
    channel,
    apiKey: requireEnv("GEMINI_API_KEY", environment),
    model,
    language,
    geminiTimeoutMs,
    geminiMaxRetries,
    geminiRetryBaseDelayMs,
    questionTimeoutMs,
    questionQueueTimeoutMs,
    commandCooldownMs: parseCooldownMilliseconds(
      "COMMAND_COOLDOWN_SECONDS",
      environment.COMMAND_COOLDOWN_SECONDS,
      15,
    ),
    userCooldownMs: parseCooldownMilliseconds(
      "USER_COOLDOWN_SECONDS",
      environment.USER_COOLDOWN_SECONDS,
      30,
    ),
    maxQuestionLength: parsePositiveSafeInteger(
      "MAX_QUESTION_LENGTH",
      environment.MAX_QUESTION_LENGTH,
      300,
      MAX_QUESTION_LENGTH_CHARS,
    ),
    maxAnswerLength: parsePositiveSafeInteger(
      "MAX_ANSWER_LENGTH",
      environment.MAX_ANSWER_LENGTH,
      420,
      MAX_ANSWER_LENGTH_CHARS,
    ),
    maxPendingQuestions: parsePositiveSafeInteger(
      "MAX_PENDING_QUESTIONS",
      environment.MAX_PENDING_QUESTIONS,
      5,
      MAX_PENDING_QUESTIONS_LIMIT,
    ),
  };
};
