import { loadPersona } from "./ai/profiles.js";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { createObservability } from "./observability/index.js";
import { createAiStateStore } from "./stores/ai-state.js";
import { createResponseLanguageStore } from "./stores/response-language.js";
import { createTwitchClient } from "./twitch/client.js";
import { registerShutdownHandlers } from "./twitch/shutdown.js";

const telemetry = createObservability();
const app = createApp({
  config,
  persona: loadPersona(config.personaFile, config.persona),
  client: createTwitchClient(config),
  aiState: createAiStateStore(undefined, telemetry, process.env),
  language: createResponseLanguageStore(undefined, config.language, telemetry, process.env),
  telemetry,
});

registerShutdownHandlers(
  (signal, listener) => process.once(signal, listener),
  async () => {
    try {
      await app.shutdown();
    } catch {
      process.exitCode = 1;
    }
  },
);
try {
  await app.start();
} catch {
  process.exitCode = 1;
}
