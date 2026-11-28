import type { CommandHandler } from "../../types/commands.js";
import { createEducationalCommand } from "../shared/educational.js";
/**
 * Creates !summarize with the shared AI queue and admission limits.
 * @param question Shared managed question handler.
 * @returns Educational command with a fixed trusted task selector.
 */
export const createSummarizeCommand = (question: CommandHandler): CommandHandler =>
  createEducationalCommand("summarize", question);
