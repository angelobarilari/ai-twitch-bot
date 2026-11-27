import type { CommandHandler } from "../../types/commands.js";
import type { QuestionQueue } from "../../queue/question-queue.js";
import { isModerator } from "../../safety/permissions.js";
/**
 * Creates the !queue handler without process configuration or global state.
 * @param queue Injected queue inspection and moderation operations.
 * @returns Command bound to the supplied application dependencies.
 */
export const createQueueCommand =
  (queue: Pick<QuestionQueue, "status" | "clear">): CommandHandler =>
  async ({ args, reply, tags, channel }): Promise<void> => {
    if (!isModerator(tags, channel)) {
      await reply("Only moderators and the broadcaster can view or clear the queue.");
      return;
    }

    const action = args[0]?.toLowerCase();
    if (args.length > 1 || (action && action !== "clear")) {
      await reply("Usage: !queue or !queue clear.");
      return;
    }

    if (action === "clear") {
      const removed = await queue.clear();
      await reply(
        removed === 0
          ? "There are no waiting questions to remove."
          : `${removed} ${removed === 1 ? "question removed" : "questions removed"} from the queue.`,
      );
      return;
    }

    const { active, waiting } = queue.status();
    await reply(
      `Question queue: ${active ? "1 in progress" : "none in progress"}, ${waiting} waiting.`,
    );
  };
