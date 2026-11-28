import type { StateStore } from "../stores/types.js";
import { normalizeChatText } from "../safety/normalize-chat-text/index.js";
import { isSafeChatText } from "../safety/is-safe-chat-text/index.js";

export type ChannelFact = {
  id: string;
  text: string;
  createdBy: string;
  updatedBy: string;
  expiresAt: number;
};
export type MemorySnapshot = { channel: string; enabled: boolean; facts: ChannelFact[] };
export type ChannelMemory = ReturnType<typeof createChannelMemory>;

/**
 * Creates disabled-by-default memory for one configured channel.
 * @param channel Normalized configured channel name.
 * @returns Empty opt-in snapshot.
 */
export const emptyChannelMemory = (channel: string): MemorySnapshot => ({
  channel,
  enabled: false,
  facts: [],
});

/**
 * Validates a bounded snapshot loaded from untrusted persistence.
 * @param value Unknown JSON value.
 * @param channel Expected configured channel; snapshots cannot cross channels.
 * @param secrets Values prohibited in stored facts.
 * @returns Validated snapshot with copied fact objects.
 * @throws If structure, content, authors, or limits are invalid.
 */
export const validateChannelMemory = (
  value: unknown,
  channel: string,
  secrets: readonly string[] = [],
): MemorySnapshot => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("channel" in value) ||
    value.channel !== channel ||
    !("enabled" in value) ||
    typeof value.enabled !== "boolean" ||
    !("facts" in value) ||
    !Array.isArray(value.facts) ||
    value.facts.length > 20 ||
    Object.keys(value).length !== 3
  )
    throw new Error("Invalid channel memory snapshot.");
  const ids = new Set<string>();
  const facts = value.facts.map((fact: unknown): ChannelFact => {
    if (
      typeof fact !== "object" ||
      fact === null ||
      Array.isArray(fact) ||
      Object.keys(fact).length !== 5 ||
      !("id" in fact) ||
      typeof fact.id !== "string" ||
      !/^[a-z0-9_-]{1,24}$/.test(fact.id) ||
      ids.has(fact.id) ||
      !("text" in fact) ||
      typeof fact.text !== "string" ||
      !fact.text ||
      normalizeChatText(fact.text) !== fact.text ||
      Array.from(fact.text).length > 200 ||
      !isSafeChatText(fact.text, secrets) ||
      !("createdBy" in fact) ||
      typeof fact.createdBy !== "string" ||
      !/^[1-9]\d{0,19}$/.test(fact.createdBy) ||
      !("updatedBy" in fact) ||
      typeof fact.updatedBy !== "string" ||
      !/^[1-9]\d{0,19}$/.test(fact.updatedBy) ||
      !("expiresAt" in fact) ||
      typeof fact.expiresAt !== "number" ||
      !Number.isSafeInteger(fact.expiresAt) ||
      fact.expiresAt <= 0
    )
      throw new Error("Invalid channel memory fact.");
    ids.add(fact.id);
    return {
      id: fact.id,
      text: fact.text,
      createdBy: fact.createdBy,
      updatedBy: fact.updatedBy,
      expiresAt: fact.expiresAt,
    };
  });
  if (!value.enabled && facts.length) throw new Error("Disabled channel memory must be empty.");
  return { channel, enabled: value.enabled, facts };
};

/**
 * Creates bounded, expiring channel facts with transactional store updates.
 * @param channel Configured channel; all reads and mutations enforce this scope.
 * @param store Snapshot adapter; default memory is volatile and disabled.
 * @param now Injectable expiry clock.
 * @param secrets Credentials prohibited in fact text.
 * @returns Opt-in, listing, editing, and removal operations.
 * @throws If initial persistence is invalid or any mutation cannot be saved.
 */
export const createChannelMemory = (
  channel: string,
  store?: StateStore<MemorySnapshot>,
  now: () => number = Date.now,
  secrets: readonly string[] = [],
) => {
  let state = validateChannelMemory(store?.get() ?? emptyChannelMemory(channel), channel, secrets);
  /**
   * Returns nonexpired facts without exposing mutable internal objects.
   * @param source Source IRC channel.
   * @returns Public active facts only in the configured enabled channel.
   */
  const list = (source: string): ChannelFact[] =>
    source.replace(/^#/, "").toLowerCase() === channel && state.enabled
      ? state.facts.filter((fact) => now() < fact.expiresAt).map((fact) => ({ ...fact }))
      : [];
  /**
   * Saves a complete validated snapshot before changing live state.
   * @param next New snapshot.
   * @returns Nothing.
   * @throws If storage rejects the transaction.
   */
  const save = (next: MemorySnapshot): void => {
    const checked = validateChannelMemory(next, channel, secrets);
    store?.set(checked);
    state = checked;
  };
  return {
    list,
    enabled: (): boolean => state.enabled,
    change: (
      source: string,
      actor: string,
      action: "on" | "off" | "add" | "edit" | "remove",
      id = "",
      text = "",
      ttlMinutes = 1440,
    ): void => {
      if (source.replace(/^#/, "").toLowerCase() !== channel || !/^[1-9]\d{0,19}$/.test(actor))
        throw new Error("Invalid channel memory author or channel.");
      if (action === "on" || action === "off") {
        save({ channel, enabled: action === "on", facts: action === "off" ? [] : list(source) });
        return;
      }
      if (!state.enabled) throw new Error("Channel memory is disabled.");
      const facts = list(source);
      const index = facts.findIndex((fact) => fact.id === id);
      if (action === "remove") {
        if (index < 0) throw new Error("Unknown fact key.");
        facts.splice(index, 1);
        save({ ...state, facts });
        return;
      }
      if (!Number.isSafeInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 43_200)
        throw new Error("Fact TTL must be 1 to 43200 minutes.");
      if (action === "add" && (index >= 0 || facts.length >= 20))
        throw new Error("Fact key already exists or memory is full.");
      if (action === "edit" && index < 0) throw new Error("Unknown fact key.");
      const fact = {
        id,
        text: normalizeChatText(text) ?? "",
        createdBy: index < 0 ? actor : facts[index]!.createdBy,
        updatedBy: actor,
        expiresAt: now() + ttlMinutes * 60_000,
      };
      if (index < 0) facts.push(fact);
      else facts[index] = fact;
      save({ ...state, facts });
    },
  };
};
