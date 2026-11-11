import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tmi from "tmi.js";
import type { CommandContext } from "../types/commands.js";

let parseCommand: typeof import("./index.js").parseCommand;
let createQuestionCommand: typeof import("./question/index.js").createQuestionCommand;
let config: typeof import("../config.js").config;
let setAiEnabled: typeof import("./shared/ai-state.js").setAiEnabled;
let queueCommand: typeof import("./queue/index.js").queueCommand;
let createMessageHandler: typeof import("./index.js").createMessageHandler;
let getResponseLanguage: typeof import("../services/response-language.js").getResponseLanguage;
let createResponseLanguageStore: typeof import("../services/response-language.js").createResponseLanguageStore;
let stateDirectory: string;
let previousStateFile: string | undefined;
let previousLanguageFile: string | undefined;

before(async () => {
  const requiredVariables = [
    "TWITCH_BOT_USERNAME",
    "TWITCH_OAUTH_TOKEN",
    "TWITCH_CHANNEL",
    "GEMINI_API_KEY",
  ] as const;
  const previousValues = new Map(requiredVariables.map((name) => [name, process.env[name]]));
  stateDirectory = mkdtempSync(join(tmpdir(), "ai-twitch-bot-command-test-"));
  previousStateFile = process.env.AI_STATE_FILE;
  previousLanguageFile = process.env.AI_LANGUAGE_FILE;

  process.env.TWITCH_BOT_USERNAME = "test-bot";
  process.env.TWITCH_OAUTH_TOKEN = "oauth:test-token";
  process.env.TWITCH_CHANNEL = "test_channel";
  process.env.GEMINI_API_KEY = "test-api-key";
  process.env.AI_STATE_FILE = join(stateDirectory, "state.json");
  process.env.AI_LANGUAGE_FILE = join(stateDirectory, "language.json");

  try {
    ({ parseCommand } = await import("./index.js"));
    ({ createQuestionCommand } = await import("./question/index.js"));
    ({ config } = await import("../config.js"));
    ({ setAiEnabled } = await import("./shared/ai-state.js"));
    ({ getResponseLanguage } = await import("../services/response-language.js"));
    ({ createResponseLanguageStore } = await import("../services/response-language.js"));
    ({ queueCommand } = await import("./queue/index.js"));
    ({ createMessageHandler } = await import("./index.js"));
    setAiEnabled(true);
  } finally {
    for (const [name, value] of previousValues) {
      if (typeof value === "undefined") delete process.env[name];
      else process.env[name] = value;
    }
  }
});

after(() => {
  if (typeof previousStateFile === "undefined") delete process.env.AI_STATE_FILE;
  else process.env.AI_STATE_FILE = previousStateFile;
  if (typeof previousLanguageFile === "undefined") delete process.env.AI_LANGUAGE_FILE;
  else process.env.AI_LANGUAGE_FILE = previousLanguageFile;
  rmSync(stateDirectory, { recursive: true, force: true });
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

test("parseCommand rejects a command prefix without a name", () => {
  assert.equal(parseCommand("!"), null);
  assert.equal(parseCommand("! \t"), null);
});

test("message handler ignores malformed, unknown, and self-authored commands", async () => {
  const replies: string[] = [];
  const client = new tmi.Client({ channels: [] });
  client.say = async (_channel, message) => {
    replies.push(message);
    return [message];
  };
  const handleMessage = createMessageHandler(client);

  await handleMessage("test_channel", { username: "viewer" }, "!", false);
  await handleMessage("test_channel", { username: "viewer" }, "!unknown", false);
  await handleMessage("test_channel", { username: "bot" }, "!help", true);

  assert.deepEqual(replies, []);
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
  assert.match(replies[0] ?? "", /!about/);
});

test("viewers can check whether AI responses are enabled with !status", async () => {
  const replies: string[] = [];
  const client = new tmi.Client({ channels: [] });
  client.say = async (_channel, message) => {
    replies.push(message);
    return [message];
  };
  const handleMessage = createMessageHandler(client);

  setAiEnabled(true);
  await handleMessage("test_channel", { username: "viewer" }, "!status", false);
  setAiEnabled(false);
  await handleMessage("test_channel", { username: "viewer" }, "!status", false);
  setAiEnabled(true);

  assert.deepEqual(replies, ["The AI is enabled.", "The AI is disabled."]);
});

test("viewers can set and reset the channel-wide response language", async () => {
  const replies: string[] = [];
  const client = new tmi.Client({ channels: [] });
  client.say = async (_channel, message) => {
    replies.push(message);
    return [message];
  };
  const handleMessage = createMessageHandler(client);

  await handleMessage("test_channel", { username: "viewer-one" }, "!language English", false);
  assert.equal(getResponseLanguage(), "English");
  await handleMessage(
    "test_channel",
    { username: "viewer-two" },
    "!language Portuguese (Brazil)",
    false,
  );
  assert.equal(getResponseLanguage(), "Portuguese (Brazil)");
  await handleMessage("test_channel", { username: "viewer-three" }, "!language auto", false);
  assert.equal(getResponseLanguage(), "auto");
  assert.equal(createResponseLanguageStore(join(stateDirectory, "language.json")).get(), "auto");

  assert.deepEqual(replies, [
    "Response language set to English.",
    "Response language set to Portuguese (Brazil).",
    "Responses will follow the language of each question.",
  ]);
});

test("language command reports current language and rejects invalid values", async () => {
  const replies: string[] = [];
  const client = new tmi.Client({ channels: [] });
  client.say = async (_channel, message) => {
    replies.push(message);
    return [message];
  };
  const handleMessage = createMessageHandler(client);

  await handleMessage("test_channel", { username: "viewer" }, "!language Spanish", false);
  await handleMessage("test_channel", { username: "viewer" }, "!language", false);
  await handleMessage("test_channel", { username: "viewer" }, `!language ${"x".repeat(41)}`, false);
  assert.equal(getResponseLanguage(), "Spanish");
  assert.deepEqual(replies, [
    "Response language set to Spanish.",
    "Current response language: Spanish. Use !language <language> or !language auto.",
    "Usage: !language <language> or !language auto (maximum 40 characters).",
  ]);
});

test("message handler routes a question through Gemini and replies in chat", async () => {
  const apiCalls: string[] = [];
  const sentMessages: Array<{ channel: string; message: string }> = [];
  const client = new tmi.Client({ channels: [] });
  client.say = async (channel, message) => {
    sentMessages.push({ channel, message });
    return [message];
  };
  const command = createQuestionCommand(async (question) => {
    apiCalls.push(question);
    return "A fake Gemini answer.";
  });
  const handleMessage = createMessageHandler(client, new Map([["question", command]]));

  await handleMessage(
    "test_channel",
    { username: "viewer" },
    "!question What is the capital of Brazil?",
    false,
  );

  assert.deepEqual(apiCalls, ["What is the capital of Brazil?"]);
  assert.deepEqual(sentMessages, [{ channel: "test_channel", message: "A fake Gemini answer." }]);
});

test("question flow reports Gemini failure and continues processing later requests", async () => {
  const previousConsoleError = console.error;
  const loggedErrors: unknown[][] = [];
  const replies: string[] = [];
  let currentTime = 100_000;
  let calls = 0;
  const client = new tmi.Client({ channels: [] });
  client.say = async (_channel, message) => {
    replies.push(message);
    return [message];
  };
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };
  const questionCommand = createQuestionCommand(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error("Gemini unavailable");
      return "A later answer.";
    },
    () => currentTime,
  );
  const handleMessage = createMessageHandler(client, new Map([["question", questionCommand]]));

  try {
    await handleMessage("test_channel", { username: "viewer-one" }, "!question first", false);
    currentTime += config.commandCooldownMs + 1;
    await handleMessage("test_channel", { username: "viewer-two" }, "!question second", false);

    assert.deepEqual(replies, [
      "I could not query the AI right now. Please try again later.",
      "A later answer.",
    ]);
    assert.equal(calls, 2);
    assert.equal(loggedErrors.length, 1);
  } finally {
    console.error = previousConsoleError;
  }
});

test("question flow blocks unsafe Gemini answers and continues processing later requests", async () => {
  const replies: string[] = [];
  let currentTime = 100_000;
  let calls = 0;
  const client = new tmi.Client({ channels: [] });
  client.say = async (_channel, message) => {
    replies.push(message);
    return [message];
  };
  const questionCommand = createQuestionCommand(
    async () => {
      calls += 1;
      return calls === 1 ? "make a bomb" : "A safe answer.";
    },
    () => currentTime,
  );
  const handleMessage = createMessageHandler(client, new Map([["question", questionCommand]]));

  await handleMessage("test_channel", { username: "viewer-one" }, "!question first", false);
  currentTime += config.commandCooldownMs + 1;
  await handleMessage("test_channel", { username: "viewer-two" }, "!question second", false);

  assert.deepEqual(replies, [
    "The AI could not generate a safe answer for that question.",
    "A safe answer.",
  ]);
});

test("question flow contains Twitch reply failures and remains usable", async () => {
  const previousConsoleError = console.error;
  const error = new Error("Twitch client is disconnected");
  const loggedErrors: unknown[][] = [];
  const replies: string[] = [];
  let currentTime = 100_000;
  let failReplies = true;
  const client = new tmi.Client({ channels: [] });
  client.say = async (_channel, message) => {
    if (failReplies) throw error;
    replies.push(message);
    return [message];
  };
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };
  const questionCommand = createQuestionCommand(
    async () => "A fake answer.",
    () => currentTime,
  );
  const handleMessage = createMessageHandler(client, new Map([["question", questionCommand]]));

  try {
    await handleMessage("test_channel", { username: "viewer-one" }, "!question first", false);
    failReplies = false;
    currentTime += config.commandCooldownMs + 1;
    await handleMessage("test_channel", { username: "viewer-two" }, "!question second", false);

    assert.deepEqual(replies, ["A fake answer."]);
    assert.deepEqual(
      loggedErrors.map((entry) => entry[0]),
      ["Error while querying the AI:", 'Failed to handle Twitch chat command "!question":'],
    );
    assert.ok(loggedErrors.every((entry) => entry[1] === error));
  } finally {
    console.error = previousConsoleError;
  }
});

test("message handler logs reply failures without rejecting the event handler", async () => {
  const previousConsoleError = console.error;
  const error = new Error("Twitch client is disconnected");
  const loggedErrors: unknown[][] = [];
  const client = new tmi.Client({ channels: [] });
  client.say = async () => {
    throw error;
  };
  console.error = (...args: unknown[]) => {
    loggedErrors.push(args);
  };

  try {
    await createMessageHandler(client)("test_channel", { username: "viewer" }, "!help", false);

    assert.deepEqual(loggedErrors, [['Failed to handle Twitch chat command "!help":', error]]);
  } finally {
    console.error = previousConsoleError;
  }
});

test("message handler routes !about to the registered command", async () => {
  const replies: string[] = [];
  const client = new tmi.Client({ channels: [] });
  client.say = async (_channel, message) => {
    replies.push(message);
    return [message];
  };

  await createMessageHandler(client)("test_channel", { username: "viewer" }, "!about", false);

  assert.deepEqual(replies, [
    "I am an AI chat bot for Twitch. I use Gemini to answer questions briefly; use !help to see the available commands.",
  ]);
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
  assert.deepEqual(replies, ["The AI is currently disabled."]);
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
  assert.deepEqual(replies, ["Your question was added to the queue. Position: 1."]);

  resolveFirstAnswer("first answer");
  await Promise.all([firstCommand, secondCommand]);

  assert.deepEqual(calls, ["first question", "second question"]);
  assert.deepEqual(replies, [
    "Your question was added to the queue. Position: 1.",
    "first answer",
    "second answer",
  ]);
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
  assert.ok(replies.includes("Your question was removed from the queue by a moderator."));

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
    "Only moderators and the broadcaster can view or clear the queue.",
    "Question queue: none in progress, 0 waiting.",
    "There are no waiting questions to remove.",
  ]);
});
