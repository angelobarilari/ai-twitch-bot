import type { Persona, ResponseMode } from "./profiles.js";
export type AskOptions = {
  signal?: AbortSignal;
  concise?: boolean;
  mode?: ResponseMode;
  persona?: Persona;
  maxAnswerLength?: number;
  history?: readonly ConversationTurn[];
};

export type ConversationTurn = { question: string; answer: string };

export type AiProvider = {
  ask: (question: string, options?: AskOptions) => Promise<string | null>;
};
