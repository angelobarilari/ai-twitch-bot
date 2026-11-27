import { config } from "../config.js";
import { createResponseLanguageStore as createStore } from "../stores/response-language.js";
export { isValidResponseLanguage, normalizeResponseLanguage } from "../stores/response-language.js";
/**
 * Creates a store using the default runtime language for compatibility.
 * @param filePath Optional persistence file.
 * @param fallback Initial language when no state exists.
 * @returns Language store accessors.
 * @throws If persisted state or language is invalid.
 */
export const createResponseLanguageStore = (filePath?: string, fallback = config.language) =>
  createStore(filePath, fallback, undefined, process.env);
const language = createResponseLanguageStore();
export const getResponseLanguage = language.get;
export const setResponseLanguage = language.set;
