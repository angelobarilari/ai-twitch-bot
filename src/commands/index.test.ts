import assert from "node:assert/strict";
import { before, test } from "node:test";
import tmi from "tmi.js";
import type { CommandContext } from "../types/commands.js";

let parseCommand: typeof import("./index.js").parseCommand;
let createQuestionCommand: typeof import("./question.js").createQuestionCommand;
let config: typeof import("../config.js").config;
let setAiEnabled: typeof import("./ai-state.js").setAiEnabled;
let queueCommand: typeof import("./queue.js").queueCommand;
let createMessageHandler: typeof import("./index.js").createMessageHandler;

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
    ({ setAiEnabled } = await import("./ai-state.js"));
    ({ queueCommand } = await import("./queue.js"));
    ({ createMessageHandler } = await import("./index.js"));
    setAiEnabled(true);
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

test("message handler routes !help to the registered command", async () => {
  const replies: string[] = [];
  const client = new tmi.Client({ channels: [] });
  client.say = async (_channel, message) => {
    replies.push(message);
    return [message];
  };

  await createMessageHandler(client)("test_channel", { username: "viewer" }, "!help", false);

  assert.equal(replies.length, 1);
  assert.match(replies[0] ?? "", /!help/);
  assert.match(replies[0] ?? "", /!question/);
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

test("questionCommand refuses questions while AI is disabled", async () => {
  const replies: string[] = [];
  let calls = 0;
  const command = createQuestionCommand(async () => {
    calls += 1;
    return "answer";
  });

  setAiEnabled(false);
  try {
    await command(createContext("viewer", "a question", replies));
  } finally {
    setAiEnabled(true);
  }

  assert.equal(calls, 0);
  assert.deepEqual(replies, ["A IA está desligada no momento."]);
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

test("questionCommand rejects requests when the pending queue is full", async () => {
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
      if (question === "question 0") {
        markFirstRequestStarted();
        return firstAnswer;
      }
      return "answer";
    },
    () => currentTime,
  );
  const acceptedCommands = [command(createContext("viewer-0", "question 0", replies))];
  await firstRequestStarted;

  for (let index = 1; index < config.maxPendingQuestions; index += 1) {
    currentTime += config.commandCooldownMs + 1;
    acceptedCommands.push(command(createContext(`viewer-${index}`, `question ${index}`, replies)));
  }

  currentTime += config.commandCooldownMs + 1;
  await command(createContext("viewer-overflow", "overflow question", replies));
  assert.ok(replies.includes("The AI question queue is full. Please try again later."));

  resolveFirstAnswer("answer");
  await Promise.all(acceptedCommands);
  assert.equal(calls.length, config.maxPendingQuestions);
  assert.ok(!calls.includes("overflow question"));

  currentTime += config.commandCooldownMs + 1;
  await command(createContext("viewer-after-queue", "after queue", replies));
  assert.ok(calls.includes("after queue"));
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

test("questionCommand reports queue status and moderator clearing cancels waiting questions", async () => {
  let currentTime = 100_000;
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
      if (question === "first question") {
        markFirstRequestStarted();
        return firstAnswer;
      }
      return "unexpected queued answer";
    },
    () => currentTime,
  );

  const firstCommand = command(createContext("viewer-one", "first question", replies));
  await firstRequestStarted;

  currentTime += config.commandCooldownMs + 1;
  const queuedCommand = command(createContext("viewer-two", "queued question", replies));
  assert.deepEqual(command.getQueueStatus(), { active: true, waiting: 1 });

  assert.equal(await command.clearPendingQuestions(), 1);
  await queuedCommand;
  assert.deepEqual(command.getQueueStatus(), { active: true, waiting: 0 });
  assert.ok(replies.includes("Sua pergunta foi removida da fila por um moderador."));

  resolveFirstAnswer("first answer");
  await firstCommand;
  assert.deepEqual(command.getQueueStatus(), { active: false, waiting: 0 });

  currentTime += config.commandCooldownMs + 1;
  await command(createContext("viewer-three", "question after clear", replies));
  assert.ok(replies.includes("unexpected queued answer"));
});

test("queueCommand restricts queue controls to moderators", async () => {
  const replies: string[] = [];
  const viewerContext = createContext("viewer", "", replies);
  await queueCommand(viewerContext);
  await queueCommand({
    ...viewerContext,
    tags: { mod: true },
  });
  await queueCommand({
    ...viewerContext,
    args: ["clear"],
    text: "clear",
    tags: { badges: { broadcaster: "1" } },
  });
  assert.deepEqual(replies, [
    "Apenas moderadores e o broadcaster podem consultar ou limpar a fila.",
    "Fila de perguntas: nenhuma em andamento, 0 aguardando.",
    "Não há perguntas aguardando para remover.",
  ]);
});
