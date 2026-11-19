/**
 * Trims a response-language setting and canonicalizes the special auto value.
 *
 * @param language Language name or the special "auto" setting.
 * @returns The trimmed language name, or "auto" in lowercase.
 */
export const normalizeResponseLanguage = (language: string): string => {
  const normalized = language.trim();
  return normalized.toLowerCase() === "auto" ? "auto" : normalized;
};
