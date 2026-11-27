import type { CommandHandler } from "../../types/commands.js";
import type { StateStore } from "../../stores/types.js";
import type { QuestionQueue } from "../../queue/question-queue.js";
import type { Observability } from "../../observability/index.js";
/**
 * Creates the !status handler without process configuration or global state.
 * @param state Injected AI switch.
 * @param questionQueue Live queue status.
 * @param observability Independent component health.
 * @returns Command bound to the supplied application dependencies.
 */
export const createStatusCommand =
  (
    state: StateStore<boolean>,
    questionQueue: Pick<QuestionQueue, "status">,
    observability: Observability,
  ): CommandHandler =>
  async ({ reply }): Promise<void> => {
    const { health } = observability.snapshot();
    const queue = questionQueue.status();
    await reply(
      `The AI is ${state.get() ? "enabled" : "disabled"}. Twitch: ${health.twitch}; Gemini: ${health.gemini}; persistence: ${health.aiState}/${health.language}; queue: ${queue.active ? "active" : "idle"}, ${queue.waiting} waiting.`,
    );
  };
