import "dotenv/config";
import { createAiStateStore as createStore } from "../../stores/ai-state.js";
/**
 * Adapts the default file store to the existing command API.
 * @param filePath Optional persistence file.
 * @returns Legacy state accessors sharing one store.
 * @throws If persisted state cannot be loaded.
 */
export const createAiStateStore = (filePath?: string) => {
  const store = createStore(filePath, undefined, process.env);
  return { isEnabled: store.get, setEnabled: store.set };
};
const state = createAiStateStore();
export const isAiEnabled = state.isEnabled;
export const setAiEnabled = state.setEnabled;
