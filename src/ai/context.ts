import type { ConversationTurn } from "./types.js";

type Entry = { turns: Array<ConversationTurn & { expiresAt: number }>; expiresAt: number };
export type ConversationContext = ReturnType<typeof createConversationContext>;

/**
 * Creates bounded volatile conversation storage with expiring per-viewer sessions.
 * @param options Maximum users, turns, characters, TTL, and injectable clock.
 * @returns Session creation and deletion; nothing is written to disk or logged.
 * @throws If any limit is not a positive supported integer.
 */
export const createConversationContext = (
  options: {
    maxUsers?: number;
    maxTurns?: number;
    maxCharacters?: number;
    ttlMs?: number;
    now?: () => number;
  } = {},
) => {
  const {
    maxUsers = 1000,
    maxTurns = 3,
    maxCharacters = 4000,
    ttlMs = 300_000,
    now = Date.now,
  } = options;
  for (const value of [maxUsers, maxTurns, maxCharacters, ttlMs]) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
      throw new RangeError("Context limits must be positive supported integers.");
  }
  const entries = new Map<string, Entry>();
  /**
   * Removes expired sessions and turns before accessing stored content.
   * @returns Nothing.
   */
  const prune = (): void => {
    for (const [key, entry] of entries) {
      if (now() >= entry.expiresAt) entries.delete(key);
      else entry.turns = entry.turns.filter((turn) => now() < turn.expiresAt);
    }
  };
  return {
    begin: (key: string) => {
      prune();
      let entry = entries.get(key);
      if (!entry && entries.size < maxUsers) {
        entry = { turns: [], expiresAt: now() + ttlMs };
        entries.set(key, entry);
      }
      const session = entry;
      return {
        read: (): ConversationTurn[] => {
          prune();
          if (!session || entries.get(key) !== session) return [];
          return session.turns.map(({ question, answer }) => ({ question, answer }));
        },
        append: (question: string, answer: string, validUntil = now() + ttlMs): void => {
          prune();
          if (!session || entries.get(key) !== session) return;
          if (validUntil <= now()) return;
          session.turns.push({ question, answer, expiresAt: Math.min(now() + ttlMs, validUntil) });
          while (
            session.turns.length > maxTurns ||
            session.turns.reduce(
              (total, turn) => total + Array.from(turn.question + turn.answer).length,
              0,
            ) > maxCharacters
          )
            session.turns.shift();
          session.expiresAt = Math.max(now(), ...session.turns.map((turn) => turn.expiresAt));
        },
      };
    },
    clear: (key: string): void => {
      entries.delete(key);
    },
    clearAll: (): void => {
      entries.clear();
    },
  };
};
