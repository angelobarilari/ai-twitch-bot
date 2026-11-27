export type AskOptions = {
  signal?: AbortSignal;
  concise?: boolean;
};

export type AiProvider = {
  ask: (question: string, options?: AskOptions) => Promise<string | null>;
};
