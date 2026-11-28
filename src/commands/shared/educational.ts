import type { CommandHandler } from "../../types/commands.js";
import type { EducationalTask } from "../../ai/types.js";

/**
 * Maps an educational command onto the existing question admission and queue pipeline.
 * @param task Fixed trusted task selector; never parsed from viewer instructions.
 * @param question Shared managed question command with common cooldowns and limits.
 * @returns Strictly parsed command using the original untrusted text as input.
 */
export const createEducationalCommand =
  (task: EducationalTask, question: CommandHandler): CommandHandler =>
  async (context) => {
    const text = context.text.trim();
    if (
      (task === "explain" && !text) ||
      ((task === "quiz" || task === "dailyfact") && context.args.length)
    ) {
      await context.reply(task === "explain" ? "Usage: !explain <term>" : `Usage: !${task}`);
      return;
    }
    await question({
      ...context,
      text: text || (task === "summarize" ? "Recent conversation" : "General knowledge"),
      task,
      requireHistory: task === "summarize" && !text,
    });
  };
