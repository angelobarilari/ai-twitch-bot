import { config } from "../config.js";

const GEMINI_TIMEOUT_MS = 10_000;

type GeminiRequestOutcome =
  "success" | "empty_response" | "http_error" | "max_tokens" | "network_error" | "timeout";

/**
 * Sends a question to Gemini and extracts the first generated text response.
 *
 * @param question Validated, non-empty question string.
 * @returns The generated answer, or null when Gemini rejects the request or returns no text.
 */
export async function askGemini(question: string): Promise<string | null> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  let outcome: GeminiRequestOutcome = "network_error";
  let status: number | undefined;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": config.apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: `Answer in ${config.language}, briefly and clearly for a Twitch chat. Keep the response within ${config.maxAnswerLength} characters. Never encourage violence, illegal activity, harassment, or sexual content involving minors. Do not use markdown.`,
              },
            ],
          },
          contents: [{ role: "user", parts: [{ text: question }] }],
          generationConfig: {
            maxOutputTokens: Math.max(1, Math.ceil(config.maxAnswerLength / 3)),
            temperature: 0.4,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
        }),
      },
    );

    if (!response.ok) {
      outcome = "http_error";
      status = response.status;
      return null;
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    };

    if (data.candidates?.[0]?.finishReason === "MAX_TOKENS") {
      outcome = "max_tokens";
      return null;
    }

    const answer =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() || null;
    outcome = answer ? "success" : "empty_response";
    return answer;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      outcome = "timeout";
      return null;
    }

    outcome = "network_error";
    return null;
  } finally {
    clearTimeout(timer);
    const logEntry = JSON.stringify({
      event: "gemini.request",
      outcome,
      durationMs: Math.round(performance.now() - startedAt),
      ...(status === undefined ? {} : { status }),
    });

    if (outcome === "success") console.info(logEntry);
    else console.error(logEntry);
  }
}
