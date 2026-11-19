/**
 * Calculates the whole seconds remaining for a cooldown.
 *
 * @param until Expiration timestamp in milliseconds.
 * @param now Current timestamp in milliseconds.
 * @returns At least one second, rounded up to avoid premature retry messages.
 */
export const remainingSeconds = (until: number, now: number): number => {
  return Math.max(1, Math.ceil((until - now) / 1000));
};
