export const MAX_CONTEXT_WINDOW = 1000;
export const DEFAULT_CONTEXT_WINDOW = 80;

export const DEFAULT_MODELS = [
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-3.5-sonnet-20240620",
  "openai/gpt-4.1-mini",
];

export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 2;
export const DEFAULT_TEMPERATURE = 0.3;

export const MIN_MAX_TOKENS = 128;
export const MAX_MAX_TOKENS = 4000;
export const DEFAULT_MAX_TOKENS = 1200;

export function clampContextWindow(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_CONTEXT_WINDOW;
  }
  const clamped = Math.max(0, Math.min(MAX_CONTEXT_WINDOW, Math.floor(value)));
  return clamped;
}

export function resolveContextWindow(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_CONTEXT_WINDOW;
  }
  return clampContextWindow(value);
}

export function clampTemperature(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TEMPERATURE;
  }
  const clamped = Math.max(MIN_TEMPERATURE, Math.min(MAX_TEMPERATURE, value));
  return Math.round(clamped * 100) / 100;
}

export function clampMaxTokens(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_TOKENS;
  }
  const clamped = Math.max(MIN_MAX_TOKENS, Math.min(MAX_MAX_TOKENS, Math.floor(value)));
  return clamped;
}
