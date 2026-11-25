/**
 * Normalizes compatibility characters and rejects malformed or hidden control text.
 *
 * @param text Untrusted chat or provider text.
 * @returns Normalized text, or null for malformed Unicode and forbidden controls.
 */
export const normalizeChatText = (text: string): string | null => {
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text))
    return null;
  const normalized = text.normalize("NFKC");
  if (/[\p{Cf}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized)) return null;
  return normalized.replace(/\s+/gu, " ").trim();
};
