export const LOCAL_MOTION_API_KEY = "local-motion";

export interface OpenAiMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenAiChatRequest {
  model: string;
  messages: OpenAiMessage[];
  stream: boolean;
  temperature: number;
  top_p: number;
  max_tokens: number;
  stop?: unknown;
}

export function buildChatRequest(modelId: string, messages: OpenAiMessage[]): OpenAiChatRequest {
  return {
    model: modelId,
    messages,
    stream: true,
    temperature: 0.2,
    top_p: 0.95,
    max_tokens: 2048
  };
}

export function sanitizeExternalChatRequest(input: unknown, fallbackModelId: string): OpenAiChatRequest {
  const source = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  return {
    ...buildChatRequest(
      typeof source.model === "string" && source.model.trim() ? source.model : fallbackModelId,
      sanitizeMessages(source.messages)
    ),
    stream: source.stream !== false,
    temperature: numberOrDefault(source.temperature, 0.2),
    top_p: numberOrDefault(source.top_p, 0.95),
    max_tokens: numberOrDefault(source.max_tokens, 2048),
    stop: sanitizeStop(source.stop)
  };
}

export function sanitizeStop(value: unknown): string | string[] | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  return undefined;
}

export function isAuthorizedBearer(value: string | string[] | undefined): boolean {
  const header = Array.isArray(value) ? value[0] : value;
  return header === `Bearer ${LOCAL_MOTION_API_KEY}`;
}

function sanitizeMessages(input: unknown): OpenAiMessage[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input.map((message) => {
    const record = typeof message === "object" && message !== null ? (message as Record<string, unknown>) : {};
    const role = record.role === "assistant" || record.role === "system" ? record.role : "user";
    return {
      role,
      content: contentToText(record.content)
    };
  });
}

function contentToText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null) {
          const value = (part as Record<string, unknown>).text ?? (part as Record<string, unknown>).content;
          return typeof value === "string" ? value : "";
        }
        return "";
      })
      .join("\n");
  }
  return "";
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
