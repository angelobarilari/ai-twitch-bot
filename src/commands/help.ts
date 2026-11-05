import { config } from "../config.js";
import type { CommandHandler } from "../types/commands.js";

export const helpCommand: CommandHandler = async ({ reply }): Promise<void> => {
  await reply(
    `Comandos: !help - ajuda; !about - sobre; !ping - status; !question <pergunta> - pergunta (máx. ${config.maxQuestionLength} caracteres); !ai [on|off] - estado/controle (moderadores e broadcaster); !queue [clear] - ver/limpar fila (moderadores e broadcaster). Perguntas: cooldown global de ${config.commandCooldownMs / 1000}s e por usuário de ${config.userCooldownMs / 1000}s; fila máx. ${config.maxPendingQuestions} (inclui em andamento).`,
  );
};
