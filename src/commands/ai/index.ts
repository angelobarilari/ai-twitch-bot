import { createAiCommand } from "./handler.js";
export { createAiCommand } from "./handler.js";
import { isAiEnabled, setAiEnabled } from "../shared/ai-state.js";
import { observability } from "../../observability/index.js";
export const aiCommand = createAiCommand({ get: isAiEnabled, set: setAiEnabled }, observability);
