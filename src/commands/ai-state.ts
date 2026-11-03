let enabled = true;

export function isAiEnabled(): boolean {
  return enabled;
}

export function setAiEnabled(value: boolean): void {
  enabled = value;
}
