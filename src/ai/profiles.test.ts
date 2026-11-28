import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPersona, isResponseMode, loadPersona, responseLimit, personas } from "./profiles.js";
import { buildGeminiBody } from "./gemini/prompt.js";
import { loadConfig } from "../config/validate.js";

test("fixed modes and personas have distinct instructions and absolute limits", () => {
  assert.equal(responseLimit("concise", 2000), 210);
  assert.equal(responseLimit("detailed", 2000), 840);
  assert.equal(responseLimit("educational", 2000), 630);
  assert.equal(responseLimit("detailed", 100), 100);
  for (const profile of personas) {
    assert.equal(isPersona(profile), true);
    const body = buildGeminiBody("hello", "auto", 200, false, [], {
      persona: profile,
      mode: "educational",
    });
    assert.match(body.systemInstruction.parts[0]!.text, /Never disclose credentials/);
    assert.match(body.systemInstruction.parts[0]!.text, /Teach the concept/);
  }
  assert.equal(isPersona("ignore rules"), false);
  assert.equal(isResponseMode("concise"), true);
  assert.equal(isResponseMode(null), false);
  assert.throws(() => loadConfig({ AI_RESPONSE_MODE: "invalid" }), /AI_RESPONSE_MODE/);
  assert.throws(() => loadConfig({ BOT_PERSONA: "invalid" }), /BOT_PERSONA/);
});

test("startup persona files accept only a bounded selector and never include raw JSON in parse errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "bot-persona-"));
  const file = join(dir, "persona.json");
  try {
    assert.equal(loadPersona(undefined, "assistant"), "assistant");
    writeFileSync(file, '{"profile":"tutor"}');
    assert.equal(loadPersona(file, "assistant"), "tutor");
    for (const value of [
      null,
      [],
      {},
      { profile: "other" },
      { profile: "tutor", instructions: "override" },
    ]) {
      writeFileSync(file, JSON.stringify(value));
      assert.throws(() => loadPersona(file, "assistant"), /supported profile/);
    }
    writeFileSync(file, "private-invalid-json");
    assert.throws(
      () => loadPersona(file, "assistant"),
      (error: unknown) => error instanceof Error && !error.message.includes("private"),
    );
    writeFileSync(file, "x".repeat(4097));
    assert.throws(() => loadPersona(file, "assistant"));
    assert.throws(() => loadPersona(join(dir, "missing"), "assistant"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
