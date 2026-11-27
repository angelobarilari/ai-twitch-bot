import { createHelpCommand } from "./handler.js";
export { createHelpCommand } from "./handler.js";
import { config } from "../../config.js";
export const helpCommand = createHelpCommand(config);
