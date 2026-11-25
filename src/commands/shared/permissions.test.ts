import assert from "node:assert/strict";
import test from "node:test";
import { canAskQuestion, isModerator } from "./permissions.js";

const identity = { username: "viewer", "user-id": "42" };
const moderator = { ...identity, mod: true, badges: { moderator: "1" } };
const broadcaster = { username: "channel", "user-id": "43", badges: { broadcaster: "1" } };

test("requires consistent server identity and role metadata for administrative access", () => {
  assert.equal(isModerator(moderator, "#channel"), true);
  assert.equal(isModerator(broadcaster, "#channel"), true);
  for (const tags of [
    {},
    identity,
    { mod: true },
    { badges: { broadcaster: "1" } },
    { ...identity, mod: true },
    { ...moderator, mod: false },
    { ...moderator, "user-id": "invalid" },
    { ...broadcaster, username: "impostor" },
    { ...moderator, badges: { moderator: "0" } },
  ]) {
    assert.equal(isModerator(tags, "channel"), false);
  }
});

test("enforces optional known-account and role-based question policies", () => {
  assert.equal(canAskQuestion({}, "channel", "everyone"), true);
  assert.equal(canAskQuestion({}, "channel", "known"), false);
  assert.equal(canAskQuestion(identity, "channel", "known"), true);
  assert.equal(canAskQuestion(identity, "channel", "subscriber"), false);
  assert.equal(
    canAskQuestion(
      { ...identity, subscriber: true, badges: { subscriber: "0" } },
      "channel",
      "subscriber",
    ),
    true,
  );
  assert.equal(canAskQuestion({ ...identity, subscriber: true }, "channel", "subscriber"), false);
  assert.equal(canAskQuestion(moderator, "channel", "moderator"), true);
  assert.equal(canAskQuestion(moderator, "channel", "broadcaster"), false);
  assert.equal(canAskQuestion(broadcaster, "channel", "broadcaster"), true);
  assert.equal(canAskQuestion(identity, "channel", "invalid"), false);
});
