export const MODEL_OPTIONS = [
  "anthropic/claude-sonnet-4.5",
  "moonshotai/kimi-k2-0905",
  "x-ai/grok-4",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "openai/gpt-5",
  "deepseek/deepseek-chat-v3-0324",
  "deepseek/deepseek-r1-0528",
] as const;

export type ModelOption = (typeof MODEL_OPTIONS)[number];

export function isSupportedModel(model: string): model is ModelOption | `${ModelOption}:online` {
  return MODEL_OPTIONS.some((option) => option === model || `${option}:online` === model);
}
