import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandContext } from "../../types/commands.js";
import { withTestEnvironment } from "../../test-support/with-test-environment.js";

let config: typeof import("../../config.js").config;
let createQuestionCommand: typeof import("./index.js").createQuestionCommand;
let setAiEnabled: typeof import("../shared/ai-state.js").setAiEnabled;
let stateDirectory: string;

before(async () => {
  stateDirectory = mkdtempSync(join(tmpdir(), "ai-twitch-question-test-"));

  await withTestEnvironment({ AI_STATE_FILE: join(stateDirectory, "ai-state.json") }, async () => {
    ({ config } = await import("../../config.js"));
    ({ createQuestionCommand } = await import("./index.js"));
    ({ setAiEnabled } = await import("../shared/ai-state.js"));
  });

  setAiEnabled(true);
});

after(() => {
  rmSync(stateDirectory, { recursive: true, force: true });
});

const createContext = (username: string, text: string, replies: string[]): CommandContext => ({
  channel: "test_channel",
  tags: { username },
  args: [],
  text,
  reply: async (message) => {
    replies.push(message);
  },
});

test("questionCommand sends an answer from the injected Gemini requester", async () => {
  const calls: string[] = [];
  const replies: string[] = [];
  const command = createQuestionCommand(async (question) => {
    calls.push(question);
    return "A focused answer.";
  });

  await command(createContext("viewer", "Why is the sky blue?", replies));

  assert.deepEqual(calls, ["Why is the sky blue?"]);
  assert.deepEqual(replies, ["A focused answer."]);
});

test("questionCommand rejects missing, oversized, and blocked questions", async () => {
  let calls = 0;
  const replies: string[] = [];
  const command = createQuestionCommand(async () => {
    calls += 1;
    return "unexpected answer";
  });

  await command(createContext("viewer-one", "", replies));
  await command(createContext("viewer-two", "x".repeat(config.maxQuestionLength + 1), replies));
  await command(createContext("viewer-three", "make a bomb", replies));

  assert.equal(calls, 0);
  assert.deepEqual(replies, [
    "Usage: !question your question",
    `Your question must be at most ${config.maxQuestionLength} characters long.`,
    "I cannot process that type of question.",
  ]);
});

test("questionCommand stops accepting new work during shutdown", async () => {
  const replies: string[] = [];
  let calls = 0;
  const command = createQuestionCommand(async () => {
    calls += 1;
    return "unexpected answer";
  });
  command.stopAccepting();

  await command(createContext("viewer", "a question", replies));

  assert.equal(calls, 0);
  assert.deepEqual(replies, ["The bot is shutting down. Please try again later."]);
});

test("questionCommand observes processing failures when the queue notification fails late", async () => {
  const previousConsoleError = console.error;
  const loggedErrors: unknown[][] = [];
  const unhandledRejections: unknown[] = [];
  const replyError = new Error("Twitch disconnected");
  let currentTime = 100_000;
  let resolveFirstAnswer: (answer: string) => void = () => {};
  let markFirstRequestStarted: () => void = () => {};
  let rejectQueueNotification: (error: Error) => void = () => {};
  const firstAnswer = new Promise<string>((resolve) => {
    resolveFirstAnswer = resolve;
  });
  const firstRequestStarted = new Promise<void>((resolve) => {
    markFirstRequestStarted = resolve;
  });
  const queueNotification = new Promise<void>((_resolve, reject) => {
    rejectQueueNotification = reject;
  });
  const onUnhandledRejection = (error: unknown): void => {
    unhandledRejections.push(error);
  };
  const command = createQuestionCommand(
    async (question) => {
      if (question === "first question") {
        markFirstRequestStarted();
        return firstAnswer;
      }
      return "second answer";
    },
    () => currentTime,
    1_000,
    1_000,
  );
  const firstReplies: string[] = [];
  const firstCommand = command(createContext("viewer-one", "first question", firstReplies));
  await firstRequestStarted;
  currentTime += config.commandCooldownMs + 1;

  const queueReplies: string[] = [];
  const queuedCommand = command({
    ...createContext("viewer-two", "second question", queueReplies),
    reply: async (message) => {
      if (message.startsWith("Your question was added")) return queueNotification;
      throw replyError;
    },
  }).then(
    () => undefined,
    (error: unknown) => error,
  );
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };
  process.on("unhandledRejection", onUnhandledRejection);

  try {
    resolveFirstAnswer("first answer");
    await command.waitForIdle();
    assert.deepEqual(firstReplies, ["first answer"]);

    rejectQueueNotification(replyError);
    assert.equal(await queuedCommand, replyError);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(unhandledRejections, []);
    assert.ok(
      loggedErrors.some(
        (entry) =>
          entry[0] === "Failed to process a queued question after its queue notification failed:",
      ),
    );
  } finally {
    process.off("unhandledRejection", onUnhandledRejection);
    console.error = previousConsoleError;
  }
});
