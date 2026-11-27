import { createLanguageCommand } from "./handler.js";
export { createLanguageCommand } from "./handler.js";
import { getResponseLanguage, setResponseLanguage } from "../../services/response-language.js";
import { observability } from "../../observability/index.js";
export const languageCommand = createLanguageCommand(
  { get: getResponseLanguage, set: setResponseLanguage },
  observability,
);
