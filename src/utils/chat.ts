export const blockedContent = /(?:sex\s+with\s+minor|explosive|make\s+a\s+bomb|self[- ]?harm|suicide)/i;

/**
 * Calculates the number of whole seconds remaining for a cooldown.
 *
 * @param until Expiration timestamp in milliseconds.
 * @param now Current timestamp in milliseconds.
 * @returns At least one second, rounded up to avoid premature retry messages.
 */
export function remainingSeconds(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 1000));
}

/**
 * Splits a chat response into chunks that fit within the Twitch message limit.
 *
 * @param message Response text to split.
 * @param maxLength Maximum length allowed per chunk.
 * @returns An array of trimmed chunks, preferring to split at word boundaries.
 */
export function splitForTwitch(message: string, maxLength: number): string[] {
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
}
