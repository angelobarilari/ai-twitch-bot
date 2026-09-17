import "dotenv/config";

const requiredEnv = [
  "TWITCH_BOT_USERNAME",
  "TWITCH_OAUTH_TOKEN",
  "TWITCH_CHANNEL",
  "GEMINI_API_KEY",
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Required environment variable is missing: ${name}`);
  }
  return value.trim();
}

function parsePositiveInteger(name: string, value: string | undefined, fallback: number): number {
  const candidate = value ?? String(fallback);
  const parsed = Number(candidate);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive finite number.`);
  }

  return parsed;
}

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
    commandCooldownMs: parsePositiveInteger("COMMAND_COOLDOWN_SECONDS", process.env.COMMAND_COOLDOWN_SECONDS, 15) * 1000,
    userCooldownMs: parsePositiveInteger("USER_COOLDOWN_SECONDS", process.env.USER_COOLDOWN_SECONDS, 30) * 1000,
    maxQuestionLength: parsePositiveInteger("MAX_QUESTION_LENGTH", process.env.MAX_QUESTION_LENGTH, 300),
    maxAnswerLength: parsePositiveInteger("MAX_ANSWER_LENGTH", process.env.MAX_ANSWER_LENGTH, 420),
  };
}

for (const name of requiredEnv) {
  requireEnv(name);
}

export const config = loadConfig();
