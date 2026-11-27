import { config } from "../config.js";
import { createGeminiProvider } from "../ai/gemini/index.js";
import type { AskOptions, AiProvider } from "../ai/types.js";
import { getResponseLanguage } from "./response-language.js";
export type GeminiRequestOptions = AskOptions;
export type GeminiRequester = AiProvider["ask"];
/**
 * Adapts the provider to the existing requester API.
 * @param options Provider overrides for transport, language and retries.
 * @returns Bound ask operation with default application configuration.
 */
export const createGeminiRequester = (
  options: Parameters<typeof createGeminiProvider>[1] = {},
): GeminiRequester =>
  createGeminiProvider(config, { getLanguage: getResponseLanguage, ...options }).ask;
export const askGemini = createGeminiRequester();
