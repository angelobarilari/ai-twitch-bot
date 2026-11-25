import type { CommandHandler } from "../../types/commands.js";
import { isModerator } from "../shared/permissions.js";
import { questionCommand } from "../question/index.js";

/**
 * Handles the moderator-only !queue command for inspecting or clearing waiting questions.
 *
 * @param context Command arguments, author metadata, and chat reply function.
 * @returns A promise that resolves after the queue operation is reported.
 */
export const queueCommand: CommandHandler = async ({
  args,
  reply,
  tags,
  channel,
}): Promise<void> => {
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
    const removed = await questionCommand.clearPendingQuestions();
    console.info(JSON.stringify({ event: "admin.queue.cleared", removed }));
    await reply(
      removed === 0
        ? "There are no waiting questions to remove."
        : `${removed} ${removed === 1 ? "question removed" : "questions removed"} from the queue.`,
    );
    return;
  }

  const { active, waiting } = questionCommand.getQueueStatus();
  await reply(
    `Question queue: ${active ? "1 in progress" : "none in progress"}, ${waiting} waiting.`,
  );
};
