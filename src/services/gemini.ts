import { config } from "../config.js";

const GEMINI_TIMEOUT_MS = 10_000;

/**
 * Sends a question to Gemini and extracts the first generated text response.
 *
 * @param question Validated, non-empty question string.
 * @returns The generated answer, or null when Gemini rejects the request or returns no text.
 */
export async function askGemini(question: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "Answer in English, briefly and clearly for a Twitch chat. Never encourage violence, illegal activity, harassment, or sexual content involving minors. Do not use markdown." }],
        },
        contents: [{ role: "user", parts: [{ text: question }] }],
        generationConfig: { maxOutputTokens: 180, temperature: 0.4 },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`Gemini request failed with status ${response.status}.`);
      return null;
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() || null;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Gemini request timed out.");
      return null;
    }

    console.error("Gemini request failed.");
    return null;
  } finally {
    clearTimeout(timer);
  }
}
