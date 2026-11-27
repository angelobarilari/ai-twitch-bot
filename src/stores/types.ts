export type StateStore<T> = {
  get: () => T;
  set: (value: T) => void;
};
