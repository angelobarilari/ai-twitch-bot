import type { CommandHandler } from "../../types/commands.js";
import { createEducationalCommand } from "../shared/educational.js";
/**
 * Creates !quiz with the shared AI queue and admission limits.
 * @param question Shared managed question handler.
 * @returns Educational command with a fixed trusted task selector.
 */
export const createQuizCommand = (question: CommandHandler): CommandHandler =>
  createEducationalCommand("quiz", question);
