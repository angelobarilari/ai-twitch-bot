import { readUtf8FileWithLimit } from "../utils/read-utf8-file-with-limit/index.js";

export const responseModes = ["concise", "detailed", "educational"] as const;
export type ResponseMode = (typeof responseModes)[number];
export const personas = ["assistant", "tutor", "commentator", "technical"] as const;
export type Persona = (typeof personas)[number];
export const modeInstructions: Record<ResponseMode, string> = {
  concise: "Give a direct, concise answer.",
  detailed: "Give a complete answer with useful detail within the character budget.",
  educational: "Teach the concept step by step with one short example within the character budget.",
};
export const personaInstructions: Record<Persona, string> = {
  assistant: "Use a clear, helpful tone.",
  tutor: "Use a patient tutor's tone and explain unfamiliar terms.",
  commentator: "Use an engaging commentator's tone while distinguishing facts from opinion.",
  technical: "Use a precise technical assistant's tone and state assumptions explicitly.",
};

/**
 * Validates a response mode against the fixed trusted profiles.
 * @param value Unknown setting.
 * @returns Whether the value names a supported mode.
 */
export const isResponseMode = (value: unknown): value is ResponseMode =>
  responseModes.some((mode) => mode === value);

/**
 * Validates the fixed persona selector without accepting arbitrary instructions.
 * @param value Unknown profile name.
 * @returns Whether a trusted persona exists.
 */
export const isPersona = (value: unknown): value is Persona =>
  personas.some((persona) => persona === value);

/**
 * Calculates an absolute per-mode limit without exceeding the configured global ceiling.
 * @param mode Selected response mode.
 * @param globalLimit Validated application-wide answer limit.
 * @returns Maximum Unicode characters for this response.
 */
export const responseLimit = (mode: ResponseMode, globalLimit: number): number =>
  Math.min(globalLimit, { concise: 210, detailed: 840, educational: 630 }[mode]);

/**
 * Reads a small strict profile file; text cannot add or replace safety instructions.
 * @param file Optional JSON profile path configured by the operator.
 * @param fallback Startup persona when no file is configured.
 * @returns Validated fixed profile selector.
 * @throws If the file is unavailable, oversized, malformed, or contains unsupported fields.
 */
export const loadPersona = (file: string | undefined, fallback: Persona): Persona => {
  if (!file) return fallback;
  const text = readUtf8FileWithLimit(file, 4096);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Persona file must contain valid JSON.");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("profile" in value) ||
    !isPersona(value.profile)
  )
    throw new Error("Persona file must contain only a supported profile selector.");
  return value.profile;
};
