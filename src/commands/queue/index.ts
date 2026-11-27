import { createQueueCommand } from "./handler.js";
export { createQueueCommand } from "./handler.js";
import { questionCommand } from "../question/index.js";
export const queueCommand = createQueueCommand({
  status: questionCommand.getQueueStatus,
  clear: questionCommand.clearPendingQuestions,
});
