import type { AiProvider, AskOptions } from "../ai/types.js";
import type { StateStore } from "../stores/types.js";
import type { TwitchClient } from "../twitch/types.js";
import type { MessageHandler } from "../types/commands.js";
import { loadConfig } from "../config/validate.js";

/**
 * Creates a memory store whose failed writes preserve its previous value.
 * @param initial Initial typed value.
 * @returns Store plus a one-shot write-failure control.
 */
export const createMemoryStore = <T>(initial: T): StateStore<T> & { failNextWrite: () => void } => {
  let value = initial;
  let fail = false;
  return {
    get: () => value,
    set: (next) => {
      if (fail) {
        fail = false;
        throw new Error("Fake storage unavailable.");
      }
      value = next;
    },
    failNextWrite: () => {
      fail = true;
    },
  };
};

/**
 * Creates a controllable promise for deterministic concurrency tests.
 * @returns Promise and its resolve/reject controls.
 */
export const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

/**
 * Creates an in-memory provider that tracks concurrent and total requests.
 * @param ask Optional provider behavior; no real HTTP requests are made.
 * @returns Replaceable provider and observable invocation counters.
 */
export const createFakeProvider = (ask: AiProvider["ask"] = async () => "A safe answer.") => {
  let active = 0;
  let maximumActive = 0;
  const calls: Array<{ question: string; options?: AskOptions }> = [];
  const provider: AiProvider = {
    ask: async (question, options) => {
      calls.push({ question, options });
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      try {
        return await ask(question, options);
      } finally {
        active -= 1;
      }
    },
  };
  return { provider, calls, maximumActive: () => maximumActive };
};

/**
 * Creates a Twitch fake with explicitly controlled lifecycle and reply failures.
 * @returns Transport, messages, lifecycle counts, and incoming-message injection.
 */
export const createFakeTwitch = () => {
  let connected = (): void => {};
  let reconnect = (): void => {};
  let disconnected = (): void => {};
  let message: MessageHandler = async () => {};
  let connects = 0;
  let disconnects = 0;
  let failConnect = false;
  let failDisconnect = false;
  let failSay = false;
  const replies: string[] = [];
  const client: TwitchClient = {
    onConnected: (listener) => {
      connected = listener;
    },
    onReconnect: (listener) => {
      reconnect = listener;
    },
    onDisconnected: (listener) => {
      disconnected = listener;
    },
    onMessage: (listener) => {
      message = listener;
    },
    connect: async () => {
      connects += 1;
      if (failConnect) throw new Error("Fake connect error.");
      connected();
    },
    disconnect: async () => {
      disconnects += 1;
      if (failDisconnect) throw new Error("Fake disconnect error.");
      disconnected();
    },
    say: async (_channel, text) => {
      if (failSay) throw new Error("Fake chat error.");
      replies.push(text);
    },
  };
  return {
    client,
    replies,
    receive: (...args: Parameters<MessageHandler>) => message(...args),
    reconnect: () => reconnect(),
    disconnected: () => disconnected(),
    counts: () => ({ connects, disconnects }),
    failConnect: () => {
      failConnect = true;
    },
    failDisconnect: () => {
      failDisconnect = true;
    },
    failReplies: (fail: boolean) => {
      failSay = fail;
    },
  };
};

/**
 * Builds valid test configuration without accessing the process environment.
 * @returns Settings with short cooldowns and a bounded three-item queue.
 */
export const createTestConfig = () =>
  loadConfig({
    TWITCH_BOT_USERNAME: "test_bot",
    TWITCH_OAUTH_TOKEN: "oauth:test-token",
    TWITCH_CHANNEL: "test_channel",
    GEMINI_API_KEY: "test-api-key",
    GEMINI_MODEL: "gemini-2.5-flash",
    GEMINI_TIMEOUT_MS: "10",
    GEMINI_MAX_RETRIES: "0",
    QUESTION_TIMEOUT_MS: "200",
    QUESTION_QUEUE_TIMEOUT_MS: "1000",
    COMMAND_COOLDOWN_SECONDS: "0.001",
    USER_COOLDOWN_SECONDS: "0.001",
    MAX_PENDING_QUESTIONS: "3",
  });
