import * as vscode from "vscode";
import { buildChatRequest, type OpenAiMessage } from "./openAiChat";

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
}

export async function streamChatCompletion(
  baseUrl: string,
  modelId: string,
  apiKey: string,
  messages: OpenAiMessage[],
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<void> {
  const controller = new AbortController();
  const subscription = token.onCancellationRequested(() => controller.abort());

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(buildChatRequest(modelId, messages)),
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Local model request failed: ${response.status} ${response.statusText} ${detail}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (!token.isCancellationRequested) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const doneEvent = handleSseEvent(event, progress);
        if (doneEvent) {
          return;
        }
      }
    }
  } finally {
    subscription.dispose();
  }
}

function handleSseEvent(event: string, progress: vscode.Progress<vscode.LanguageModelResponsePart>): boolean {
  for (const line of event.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) {
      continue;
    }
    const payload = trimmed.slice("data:".length).trim();
    if (payload === "[DONE]") {
      return true;
    }
    try {
      const parsed = JSON.parse(payload) as ChatCompletionChunk;
      const text = parsed.choices?.[0]?.delta?.content;
      if (text) {
        progress.report(new vscode.LanguageModelTextPart(text));
      }
    } catch {
      // Ignore malformed SSE fragments. The next chunk may complete the stream.
    }
  }
  return false;
}
