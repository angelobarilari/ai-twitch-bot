export type GeminiResponseOutcome =
  "success" | "empty_response" | "invalid_response" | "max_tokens";

/**
 * Validates a provider payload without exposing raw data in errors or telemetry.
 * @param data Unknown JSON value returned by Gemini.
 * @returns Safe response text or a categorized validation failure.
 */
export const parseGeminiResponse = (
  data: unknown,
): { answer: string | null; outcome: GeminiResponseOutcome } => {
  let outcome: GeminiResponseOutcome = "invalid_response";
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    outcome = "invalid_response";
    return { answer: null, outcome };
  }

  const candidates = (data as { candidates?: unknown }).candidates;
  if (candidates === undefined || (Array.isArray(candidates) && candidates.length === 0)) {
    outcome = "empty_response";
    return { answer: null, outcome };
  }
  if (!Array.isArray(candidates)) {
    outcome = "invalid_response";
    return { answer: null, outcome };
  }

  const candidate = candidates[0];
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    outcome = "invalid_response";
    return { answer: null, outcome };
  }

  const result = candidate as { content?: unknown; finishReason?: unknown };
  if (result.finishReason !== undefined && typeof result.finishReason !== "string") {
    outcome = "invalid_response";
    return { answer: null, outcome };
  }

  if (result.finishReason === "MAX_TOKENS") {
    outcome = "max_tokens";
    return { answer: null, outcome };
  }

  if (result.content === undefined) {
    outcome = "empty_response";
    return { answer: null, outcome };
  }
  if (
    typeof result.content !== "object" ||
    result.content === null ||
    Array.isArray(result.content)
  ) {
    outcome = "invalid_response";
    return { answer: null, outcome };
  }

  const parts = (result.content as { parts?: unknown }).parts;
  if (parts === undefined) {
    outcome = "empty_response";
    return { answer: null, outcome };
  }
  if (!Array.isArray(parts)) {
    outcome = "invalid_response";
    return { answer: null, outcome };
  }

  const texts: string[] = [];
  for (const part of parts) {
    if (typeof part !== "object" || part === null || Array.isArray(part)) {
      outcome = "invalid_response";
      return { answer: null, outcome };
    }

    const text = (part as { text?: unknown }).text;
    if (text !== undefined && typeof text !== "string") {
      outcome = "invalid_response";
      return { answer: null, outcome };
    }
    texts.push(text ?? "");
  }

  const answer = texts.join("").trim() || null;
  outcome = answer ? "success" : "empty_response";
  return { answer, outcome };
};
