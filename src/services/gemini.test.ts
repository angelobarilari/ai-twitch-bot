import assert from "node:assert/strict";
import test from "node:test";

test("askGemini sends the API key in the header and uses an abort signal", async () => {
  const previousFetch = global.fetch;
  const requiredVariables = [
    "TWITCH_BOT_USERNAME",
    "TWITCH_OAUTH_TOKEN",
    "TWITCH_CHANNEL",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "GEMINI_LANGUAGE",
    "MAX_ANSWER_LENGTH",
  ] as const;
  const previousValues = new Map(requiredVariables.map((name) => [name, process.env[name]]));
  const calls: Record<string, unknown> = {};

  global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.url = String(input);
    calls.headers = init?.headers;
    calls.signal = init?.signal;
    calls.body = JSON.parse(String(init?.body));

    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Brasília is the capital." }] } }],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  process.env.TWITCH_BOT_USERNAME = "test-bot";
  process.env.TWITCH_OAUTH_TOKEN = "oauth:test-token";
  process.env.TWITCH_CHANNEL = "test_channel";
  process.env.GEMINI_API_KEY = "abc123";
  process.env.GEMINI_MODEL = "gemini-2.5-flash";
  process.env.GEMINI_LANGUAGE = "English";
  process.env.MAX_ANSWER_LENGTH = "120";

  try {
    const { askGemini } = await import("./gemini.js");
    const answer = await askGemini("What is the capital of Brazil?");

    assert.equal(answer, "Brasília is the capital.");
    assert.match(String(calls.url), /generativelanguage.googleapis.com/);
    assert.equal((calls.headers as Record<string, string>)["x-goog-api-key"], "abc123");
    assert.ok(calls.signal);
    const requestBody = calls.body as {
      generationConfig: { maxOutputTokens: number };
      systemInstruction: { parts: Array<{ text: string }> };
    };
    assert.equal(requestBody.generationConfig.maxOutputTokens, 40);
    assert.match(requestBody.systemInstruction.parts[0]?.text ?? "", /Answer in English/);
    assert.match(requestBody.systemInstruction.parts[0]?.text ?? "", /within 120 characters/);
  } finally {
    global.fetch = previousFetch;
    for (const [name, value] of previousValues) {
      if (typeof value === "undefined") delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("askGemini rejects responses truncated by the output token limit", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: "An incomplete response" }] },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  try {
    const { askGemini } = await import("./gemini.js");
    assert.equal(await askGemini("Tell me something"), null);
  } finally {
    global.fetch = previousFetch;
  }
});
