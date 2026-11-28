import { readUtf8FileWithLimit } from "../utils/read-utf8-file-with-limit/index.js";
import { writeUtf8FileAtomically } from "../utils/write-utf8-file-atomically/index.js";
import {
  emptyChannelMemory,
  validateChannelMemory,
  type MemorySnapshot,
} from "../ai/channel-memory.js";
import type { StateStore } from "./types.js";

/**
 * Loads an opt-in channel snapshot and saves changes atomically.
 * @param file Bounded JSON file path configured by the operator.
 * @param channel Expected channel identity.
 * @param secrets Credentials prohibited in stored facts.
 * @returns Store preserving its previous value if a write fails.
 * @throws If an existing file is unavailable, corrupt, oversized, or unsafe.
 */
export const createChannelMemoryStore = (
  file: string,
  channel: string,
  secrets: readonly string[] = [],
): StateStore<MemorySnapshot> => {
  let state = emptyChannelMemory(channel);
  let contents: string | undefined;
  try {
    contents = readUtf8FileWithLimit(file, 32768);
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw new Error("Could not read channel memory.");
  }
  if (contents !== undefined) {
    let value: unknown;
    try {
      value = JSON.parse(contents);
    } catch {
      throw new Error("Channel memory must contain valid JSON.");
    }
    state = validateChannelMemory(value, channel, secrets);
  }
  return {
    get: () => ({ ...state, facts: state.facts.map((fact) => ({ ...fact })) }),
    set: (next) => {
      const checked = validateChannelMemory(next, channel, secrets);
      writeUtf8FileAtomically(file, `${JSON.stringify(checked)}\n`);
      state = checked;
    },
  };
};
