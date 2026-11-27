import "dotenv/config";
import { loadConfig as validateConfig } from "./config/validate.js";
export type { AppConfig } from "./config/validate.js";

/**
 * Loads process settings at the application boundary.
 * @returns Validated environment configuration.
 * @throws If required settings are invalid.
 */
export const loadConfig = () => validateConfig(process.env);
export const config = loadConfig();
