export type AskOptions = {
  signal?: AbortSignal;
  concise?: boolean;
  history?: readonly ConversationTurn[];
};

export type ConversationTurn = { question: string; answer: string };

export type AiProvider = {
  ask: (question: string, options?: AskOptions) => Promise<string | null>;
};
