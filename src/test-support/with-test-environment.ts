const defaultTestEnvironment = {
  TWITCH_BOT_USERNAME: "test_bot",
  TWITCH_OAUTH_TOKEN: "oauth:test-token",
  TWITCH_CHANNEL: "test_channel",
  GEMINI_API_KEY: "test-api-key",
  GEMINI_MODEL: "gemini-2.5-flash",
  GEMINI_LANGUAGE: "auto",
  GEMINI_TIMEOUT_MS: "10000",
  GEMINI_MAX_RETRIES: "1",
  GEMINI_RETRY_BASE_DELAY_MS: "250",
  QUESTION_TIMEOUT_MS: "45000",
  QUESTION_QUEUE_TIMEOUT_MS: "120000",
  MAX_ANSWER_LENGTH: "420",
  COMMAND_COOLDOWN_SECONDS: "15",
  USER_COOLDOWN_SECONDS: "30",
  MAX_QUESTION_LENGTH: "300",
  MAX_PENDING_QUESTIONS: "5",
  QUESTION_ACCESS: "everyone",
  QUESTION_WINDOW_MS: "60000",
  MAX_QUESTIONS_PER_WINDOW: "5",
  ABUSE_PENALTY_MS: "1000",
  ABUSE_BAN_MS: "300000",
  ABUSE_MAX_STRIKES: "3",
};

/**
 * Temporarily configures the environment while test modules are imported.
 *
 * @param overrides Environment values that customize this test setup.
 * @param loadModules Callback that imports modules which read configuration at startup.
 * @returns The value returned by the module-loading callback.
 */
export const withTestEnvironment = async <T>(
  overrides: Readonly<Record<string, string>>,
  loadModules: () => Promise<T>,
): Promise<T> => {
  const environment = { ...defaultTestEnvironment, ...overrides };
  const previousValues = new Map(Object.keys(environment).map((name) => [name, process.env[name]]));

  for (const [name, value] of Object.entries(environment)) process.env[name] = value;

  try {
    return await loadModules();
  } finally {
    for (const [name, value] of previousValues) {
      if (typeof value === "undefined") delete process.env[name];
      else process.env[name] = value;
    }
  }
};
