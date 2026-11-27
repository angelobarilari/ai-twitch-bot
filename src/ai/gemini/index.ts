import { observability, type Observability } from "../../observability/index.js";
import type { AppConfig } from "../../config/validate.js";
import type { AiProvider, AskOptions } from "../types.js";
import { buildGeminiBody } from "./prompt.js";
import { parseGeminiResponse } from "./response.js";

type GeminiRequestOutcome =
  | "cancelled"
  | "success"
  | "empty_response"
  | "http_error"
  | "invalid_response"
  | "max_tokens"
  | "network_error"
  | "timeout";

type GeminiRequestOptions = AskOptions;

/**
 * Determines whether an HTTP status represents a transient Gemini failure.
 *
 * @param status HTTP status code returned by Gemini.
 * @returns Whether a retry may recover from the status.
 */
const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

/**
 * Waits for a retry delay unless the caller cancels the request.
 *
 * @param delayMs Delay before the next request attempt.
 * @param signal Optional signal that cancels the delay.
 * @returns Whether the delay completed without cancellation.
 */
const waitForRetry = (delayMs: number, signal?: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve(true);
    }, delayMs);
    /**
     * Cancels the pending retry delay when the caller aborts.
     *
     * @returns Nothing.
     */
    const handleAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", handleAbort);
      resolve(false);
    };

    signal?.addEventListener("abort", handleAbort, { once: true });
  });

/**
 * Creates a Gemini provider with injectable transport and timeout for reliable testing.
 *
 * @param config Validated provider settings supplied by the application.
 * @param options Optional fetch implementation and timeout duration.
 * @returns An AI provider whose ask operation returns generated text or a categorized null result.
 * @throws If timeout or retry options exceed supported operational limits.
 */
export const createGeminiProvider = (
  config: Pick<
    AppConfig,
    | "apiKey"
    | "model"
    | "language"
    | "maxAnswerLength"
    | "geminiTimeoutMs"
    | "geminiMaxRetries"
    | "geminiRetryBaseDelayMs"
  >,
  options: {
    fetch?: typeof fetch;
    timeoutMs?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
    language?: string;
    getLanguage?: () => string;
    telemetry?: Observability;
  } = {},
): AiProvider => {
  const telemetry = options.telemetry ?? observability;
  const timeoutMs = options.timeoutMs ?? config.geminiTimeoutMs;
  const maxRetries = options.maxRetries ?? config.geminiMaxRetries;
  const retryBaseDelayMs = options.retryBaseDelayMs ?? config.geminiRetryBaseDelayMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new RangeError("timeoutMs must be a positive supported timer duration.");
  }
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    throw new RangeError("maxRetries must be an integer between 0 and 5.");
  }
  if (
    !Number.isSafeInteger(retryBaseDelayMs) ||
    retryBaseDelayMs < 0 ||
    retryBaseDelayMs > 60_000
  ) {
    throw new RangeError("retryBaseDelayMs must be an integer between 0 and 60000.");
  }

  /**
   * Sends a question to Gemini using the configured language and request options.
   *
   * @param question Question text to send to Gemini.
   * @param requestOptions Optional cancellation signal.
   * @returns The generated answer, or null when the request fails or has no usable answer.
   */
  return {
    ask: async (
      question: string,
      requestOptions: GeminiRequestOptions = {},
    ): Promise<string | null> => {
      const language = options.language ?? options.getLanguage?.() ?? config.language;
      const startedAt = performance.now();
      let outcome: GeminiRequestOutcome = "network_error";
      let status: number | undefined;
      let attempt = 0;

      try {
        const request = options.fetch ?? fetch;
        while (attempt <= maxRetries) {
          const controller = new AbortController();
          /**
           * Propagates the caller's cancellation to the active HTTP request.
           *
           * @returns Nothing.
           */
          const abortForCaller = (): void => controller.abort();
          if (requestOptions.signal?.aborted) controller.abort();
          else requestOptions.signal?.addEventListener("abort", abortForCaller, { once: true });
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          let retry = false;

          try {
            const response = await request(
              `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-goog-api-key": config.apiKey,
                },
                signal: controller.signal,
                body: JSON.stringify(
                  buildGeminiBody(
                    question,
                    language,
                    config.maxAnswerLength,
                    requestOptions.concise,
                  ),
                ),
              },
            );

            if (!response.ok) {
              outcome = "http_error";
              status = response.status;
              retry = isRetryableStatus(response.status) && attempt < maxRetries;
              if (!retry) return null;
            } else {
              status = response.status;
              let data: unknown;
              try {
                data = await response.json();
              } catch (error) {
                if (error instanceof SyntaxError) {
                  outcome = "invalid_response";
                  return null;
                }
                throw error;
              }

              const parsed = parseGeminiResponse(data);
              outcome = parsed.outcome;
              return parsed.answer;
            }
          } catch (error) {
            if (requestOptions.signal?.aborted) {
              outcome = "cancelled";
              return null;
            }

            if (
              controller.signal.aborted ||
              (error instanceof Error && error.name === "AbortError")
            ) {
              outcome = "timeout";
              retry = attempt < maxRetries;
            } else if (error instanceof TypeError) {
              outcome = "network_error";
              retry = attempt < maxRetries;
            } else {
              outcome = "network_error";
              return null;
            }
          } finally {
            clearTimeout(timer);
            requestOptions.signal?.removeEventListener("abort", abortForCaller);
          }

          if (retry) {
            const delayMs = retryBaseDelayMs * 2 ** attempt;
            const canRetry = await waitForRetry(delayMs, requestOptions.signal);
            if (!canRetry) {
              outcome = "cancelled";
              return null;
            }
          }
          attempt += 1;
        }

        return null;
      } finally {
        telemetry.increment(`gemini.${outcome}`);
        telemetry.observe("gemini.durationMs", performance.now() - startedAt);
        if (outcome !== "cancelled")
          telemetry.setHealth("gemini", outcome === "success" ? "ready" : "degraded");
        telemetry.log(outcome === "success" ? "info" : "error", "gemini.request", {
          outcome,
          attempts: attempt + 1,
          durationMs: Math.round(performance.now() - startedAt),
          ...(status === undefined ? {} : { status }),
        });
      }
    },
  };
};
