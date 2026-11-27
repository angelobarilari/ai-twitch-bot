import { createStatusCommand } from "./handler.js";
export { createStatusCommand } from "./handler.js";
import { isAiEnabled, setAiEnabled } from "../shared/ai-state.js";
import { questionCommand } from "../question/index.js";
import { observability } from "../../observability/index.js";
export const statusCommand = createStatusCommand(
  { get: isAiEnabled, set: setAiEnabled },
  { status: questionCommand.getQueueStatus },
  observability,
);
