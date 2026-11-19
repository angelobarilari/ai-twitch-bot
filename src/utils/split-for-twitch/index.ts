/**
 * Splits a chat response into chunks that fit within the Twitch message limit.
 *
 * @param message Response text to split.
 * @param maxLength Maximum length allowed per chunk.
 * @returns An array of trimmed chunks, preferring to split at word boundaries.
 * @throws If maxLength is not a positive safe integer.
 */
export const splitForTwitch = (message: string, maxLength: number): string[] => {
  if (!Number.isSafeInteger(maxLength) || maxLength <= 0) {
    throw new RangeError("maxLength must be a positive safe integer.");
  }

  const normalized = message.replace(/\s+/g, " ").trim();
  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf(" ", maxLength);
    if (splitAt < Math.floor(maxLength * 0.5)) splitAt = maxLength;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
};
