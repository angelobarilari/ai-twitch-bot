type UserWindow = {
  startedAt: number;
  attempts: number;
  strikes: number;
  blockedUntil: number;
};

export type AbusePolicy = {
  windowMs: number;
  maxAttempts: number;
  penaltyMs: number;
  banMs: number;
  maxStrikes: number;
  maxUsers: number;
};

export type RateLimiter = {
  consume: (key: string) => boolean;
  penalize: (key: string) => void;
};

/**
 * Creates a bounded per-user sliding penalty and fixed-window attempt limiter.
 *
 * @param policy Window, progressive penalty, temporary ban, and memory limits.
 * @param now Clock used for deterministic expiration.
 * @returns Functions to admit attempts and penalize rejected abusive requests.
 * @throws If policy values are not positive safe timer-compatible integers.
 */
export const createAbuseLimiter = (
  policy: AbusePolicy,
  now: () => number = Date.now,
): RateLimiter => {
  for (const value of Object.values(policy)) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
      throw new RangeError("Abuse policy values must be positive supported integers.");
    }
  }
  const users = new Map<string, UserWindow>();

  /**
   * Expires idle identities without evicting active penalties or bans.
   *
   * @param time Current clock value.
   * @returns Nothing.
   */
  const prune = (time: number): void => {
    for (const [key, value] of users) {
      if (time >= value.startedAt + policy.windowMs && time >= value.blockedUntil)
        users.delete(key);
    }
  };

  /**
   * Registers a rejected abusive request and escalates its cooldown into a ban.
   *
   * @param key Stable viewer identity.
   * @returns Nothing.
   */
  const penalize = (key: string): void => {
    const state = users.get(key);
    if (!state || now() < state.blockedUntil) return;
    state.strikes += 1;
    const delay =
      state.strikes >= policy.maxStrikes
        ? policy.banMs
        : Math.min(policy.banMs, policy.penaltyMs * 2 ** Math.min(state.strikes - 1, 20));
    state.blockedUntil = now() + delay;
  };

  /**
   * Consumes an attempt without extending active bans when a viewer keeps sending.
   *
   * @param key Stable viewer identity.
   * @returns Whether this attempt is allowed.
   */
  const consume = (key: string): boolean => {
    const time = now();
    prune(time);
    let state = users.get(key);
    if (!state) {
      if (users.size >= policy.maxUsers) return false;
      state = { startedAt: time, attempts: 0, strikes: 0, blockedUntil: 0 };
      users.set(key, state);
    }
    if (time < state.blockedUntil) return false;
    state.attempts += 1;
    if (state.attempts > policy.maxAttempts) {
      penalize(key);
      return false;
    }
    return true;
  };
  return { consume, penalize };
};

export type AbuseLimiter = RateLimiter;
