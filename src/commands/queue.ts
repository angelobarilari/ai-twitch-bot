import type { CommandHandler } from "../types/commands.js";
import { isModerator } from "./permissions.js";
import { questionCommand } from "./question.js";

export const queueCommand: CommandHandler = async ({ args, reply, tags }): Promise<void> => {
  if (!isModerator(tags)) {
    await reply("Apenas moderadores e o broadcaster podem consultar ou limpar a fila.");
    return;
  }

  const action = args[0]?.toLowerCase();
  if (action && action !== "clear") {
    await reply("Uso: !queue ou !queue clear.");
    return;
  }

  if (action === "clear") {
    const removed = await questionCommand.clearPendingQuestions();
    await reply(
      removed === 0
        ? "Não há perguntas aguardando para remover."
        : `${removed} ${removed === 1 ? "pergunta removida" : "perguntas removidas"} da fila.`,
    );
    return;
  }

  const { active, waiting } = questionCommand.getQueueStatus();
  await reply(
    `Fila de perguntas: ${active ? "1 em andamento" : "nenhuma em andamento"}, ${waiting} aguardando.`,
  );
};
