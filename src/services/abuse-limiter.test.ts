import assert from "node:assert/strict";
import test from "node:test";
import { createAbuseLimiter } from "./abuse-limiter.js";

const policy = {
  windowMs: 1_000,
  maxAttempts: 2,
  penaltyMs: 10,
  banMs: 500,
  maxStrikes: 3,
  maxUsers: 2,
};

test("bounds attempts per identity, escalates penalties, and expires temporary bans", () => {
  let time = 0;
  const limiter = createAbuseLimiter(policy, () => time);
  assert.equal(limiter.consume("alice"), true);
  assert.equal(limiter.consume("alice"), true);
  assert.equal(limiter.consume("alice"), false);
  assert.equal(limiter.consume("bob"), true);
  time = 9;
  assert.equal(limiter.consume("alice"), false);
  time = 10;
  assert.equal(limiter.consume("alice"), false);
  time = 29;
  assert.equal(limiter.consume("alice"), false);
  time = 30;
  assert.equal(limiter.consume("alice"), false);
  time = 529;
  assert.equal(limiter.consume("alice"), false);
  time = 1_000;
  assert.equal(limiter.consume("alice"), true);
});

test("does not evict banned identities under a flood of new users", () => {
  let time = 0;
  const limiter = createAbuseLimiter(policy, () => time);
  limiter.consume("alice");
  limiter.penalize("alice");
  limiter.consume("bob");
  for (let i = 0; i < 100; i += 1) assert.equal(limiter.consume(`flood-${i}`), false);
  assert.equal(limiter.consume("alice"), false);
  time = 1_001;
  assert.equal(limiter.consume("new"), true);
});

test("rejects invalid policies and applies penalties to unsafe requests", () => {
  assert.throws(() => createAbuseLimiter({ ...policy, maxUsers: 0 }), RangeError);
  let time = 0;
  const limiter = createAbuseLimiter(policy, () => time);
  assert.equal(limiter.consume("alice"), true);
  limiter.penalize("alice");
  assert.equal(limiter.consume("alice"), false);
  time = 10;
  assert.equal(limiter.consume("alice"), true);
});
