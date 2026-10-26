import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { CommandContext } from "../types/commands.js";

let parseCommand: typeof import("./index.js").parseCommand;
let createQuestionCommand: typeof import("./question.js").createQuestionCommand;
let config: typeof import("../config.js").config;

before(async () => {
  const requiredVariables = [
    "TWITCH_BOT_USERNAME",
    "TWITCH_OAUTH_TOKEN",
    "TWITCH_CHANNEL",
    "GEMINI_API_KEY",
  ] as const;
  const previousValues = new Map(requiredVariables.map((name) => [name, process.env[name]]));

  process.env.TWITCH_BOT_USERNAME = "test-bot";
  process.env.TWITCH_OAUTH_TOKEN = "oauth:test-token";
  process.env.TWITCH_CHANNEL = "test_channel";
  process.env.GEMINI_API_KEY = "test-api-key";

  try {
    ({ parseCommand } = await import("./index.js"));
    ({ createQuestionCommand } = await import("./question.js"));
    ({ config } = await import("../config.js"));
  } finally {
    for (const [name, value] of previousValues) {
      if (typeof value === "undefined") delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("parseCommand handles command text and arguments", () => {
  assert.deepEqual(parseCommand("!question what is the capital of Brazil?"), {
    name: "question",
    args: ["what", "is", "the", "capital", "of", "Brazil?"],
    text: "what is the capital of Brazil?",
  });
});

test("parseCommand rejects non-command text", () => {
  assert.equal(parseCommand("hello there"), null);
});

function createContext(username: string, text: string, replies: string[]): CommandContext {
  return {
    channel: "test_channel",
    tags: { username },
    args: [],
    text,
    reply: async (message) => {
      replies.push(message);
    },
  };
}

test("questionCommand rejects invalid questions before calling Gemini", async () => {
  let calls = 0;
  const replies: string[] = [];
  const command = createQuestionCommand(async () => {
    calls += 1;
    return "answer";
  });

  await command(createContext("viewer", "", replies));
  await command(createContext("viewer", "x".repeat(config.maxQuestionLength + 1), replies));
  await command(createContext("viewer", "make a bomb", replies));

  assert.equal(calls, 0);
  assert.deepEqual(replies, [
    "Usage: !question your question",
    `Your question must be at most ${config.maxQuestionLength} characters long.`,
    "I cannot process that type of question.",
  ]);
});

test("questionCommand serializes accepted Gemini requests", async () => {
  let currentTime = 100_000;
  const calls: string[] = [];
  const replies: string[] = [];
  let resolveFirstAnswer: (answer: string) => void = () => {};
  let markFirstRequestStarted: () => void = () => {};
  const firstAnswer = new Promise<string>((resolve) => {
    resolveFirstAnswer = resolve;
  });
  const firstRequestStarted = new Promise<void>((resolve) => {
    markFirstRequestStarted = resolve;
  });
  const command = createQuestionCommand(
    async (question) => {
      calls.push(question);
      if (question === "first question") {
        markFirstRequestStarted();
        return firstAnswer;
      }
      return "second answer";
    },
    () => currentTime,
  );

  const firstCommand = command(createContext("viewer-one", "first question", replies));
  await firstRequestStarted;

  currentTime += config.commandCooldownMs + 1;
  const secondCommand = command(createContext("viewer-two", "second question", replies));
  assert.deepEqual(calls, ["first question"]);

  resolveFirstAnswer("first answer");
  await Promise.all([firstCommand, secondCommand]);

  assert.deepEqual(calls, ["first question", "second question"]);
  assert.deepEqual(replies, ["first answer", "second answer"]);
});

test("questionCommand asks Gemini to rewrite an overlong answer completely", async () => {
  const prompts: string[] = [];
  const replies: string[] = [];
  const command = createQuestionCommand(async (prompt) => {
    prompts.push(prompt);
    return prompts.length === 1
      ? "a".repeat(config.maxAnswerLength + 100)
      : "A concise, complete answer.";
  });

  await command(createContext("viewer", "keep it short", replies));

  assert.equal(prompts.length, 2);
  assert.match(prompts[1] ?? "", /Original question: keep it short/);
  assert.match(prompts[1] ?? "", /complete, self-contained answer/);
  assert.deepEqual(replies, ["A concise, complete answer."]);
});

test("questionCommand never sends a partial answer if it still exceeds the limit", async () => {
  const prompts: string[] = [];
  const replies: string[] = [];
  const command = createQuestionCommand(async (prompt) => {
    prompts.push(prompt);
    return "a".repeat(config.maxAnswerLength + 100);
  });

  await command(createContext("viewer", "keep it short", replies));

  assert.equal(prompts.length, 2);
  assert.deepEqual(replies, [
    "I could not provide a complete answer within the chat limit. Please try a shorter question.",
  ]);
});
