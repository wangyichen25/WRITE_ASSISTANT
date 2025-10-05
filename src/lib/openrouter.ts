export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type RouterMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
};

export type OpenRouterParams = {
  model: string;
  messages: RouterMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  signal?: AbortSignal;
};

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export async function callOpenRouter({
  model,
  messages,
  temperature = 0.3,
  maxTokens,
  stream = false,
  signal,
}: OpenRouterParams) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("Missing OPENROUTER_API_KEY environment variable");
  }

  const cleanModel = model.replace(/:online$/i, "");

  const body = {
    model: cleanModel,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream,
  };

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_PUBLIC_URL ?? "http://localhost:3000",
      "X-Title": "Write Assistant",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const detail = await safeReadError(response);
    throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText} ${detail}`);
  }

  return response;
}

async function safeReadError(response: Response) {
  try {
    const text = await response.text();
    return text ? `- ${text.slice(0, 300)}` : "";
  } catch (error) {
    console.warn("Failed to read OpenRouter error body", error);
    return "";
  }
}
