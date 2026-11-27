import { config } from "../../config.js";
import { askGemini, type GeminiRequester } from "../../services/gemini.js";
import { observability } from "../../observability/index.js";
import { isAiEnabled, setAiEnabled } from "../shared/ai-state.js";
import { createQuestionHandler } from "./handler.js";
export { createQuestionHandler } from "./handler.js";
export type { ManagedQuestionCommand, QuestionQueueStatus } from "./handler.js";
/**
 * Adapts positional callers to an explicitly composed question handler.
 * @param askQuestion Provider request operation.
 * @param now Clock used for cooldowns and queue waiting time.
 * @param questionTimeoutMs Active deadline.
 * @param questionQueueTimeoutMs Waiting deadline.
 * @returns Managed question handler using the default application stores.
 * @throws If queue settings are invalid.
 */
export const createQuestionCommand = (
  askQuestion: GeminiRequester = askGemini,
  now: () => number = Date.now,
  questionTimeoutMs = config.questionTimeoutMs,
  questionQueueTimeoutMs = config.questionQueueTimeoutMs,
) =>
  createQuestionHandler({
    config: { ...config, questionTimeoutMs, questionQueueTimeoutMs },
    provider: { ask: askQuestion },
    state: { get: isAiEnabled, set: setAiEnabled },
    telemetry: observability,
    now,
  });
export const questionCommand = createQuestionCommand();
