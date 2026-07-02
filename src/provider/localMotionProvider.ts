import * as vscode from "vscode";
import { LOCAL_MOTION_MODEL_ID, type InstalledModel } from "../types";
import type { OpenAiMessage } from "../runtime/openAiChat";
import { streamChatCompletion } from "../runtime/openAiStream";
import { LlamaServerManager, parallelRequestsSetting } from "../runtime/llamaServer";
import { LOCAL_AGENT_OFF_MESSAGE, NO_INSTALLED_MODEL_MESSAGE } from "./providerMessages";

export class LocalMotionProvider implements vscode.LanguageModelChatProvider<vscode.LanguageModelChatInformation> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly runtime: LlamaServerManager,
    private readonly readInstalledModel: () => InstalledModel | undefined
  ) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  provideLanguageModelChatInformation(
    _options: vscode.PrepareLanguageModelChatModelOptions,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.LanguageModelChatInformation[]> {
    const model = this.readInstalledModel();
    if (!model) {
      return [];
    }

    // Prefer the running session's numbers — those are the -c and --parallel
    // the server was actually spawned with. The persisted record and the
    // live setting are the last run's values and can drift if settings
    // changed since; they refresh on the next start.
    const active = this.runtime.activeSession();
    const contextTokens = active?.contextTokens ?? model.contextTokens;
    // llama-server splits -c evenly across --parallel slots, and a slot
    // holds prompt + completion together, so the honest input window is one
    // slot minus the output reservation.
    const slotTokens = Math.floor(contextTokens / (active?.parallelRequests ?? parallelRequestsSetting()));
    const maxOutputTokens = 4096;
    const info: vscode.LanguageModelChatInformation = {
      id: LOCAL_MOTION_MODEL_ID,
      name: LOCAL_MOTION_MODEL_ID,
      family: "local-gguf",
      version: model.fileName,
      maxInputTokens: Math.max(1024, slotTokens - maxOutputTokens),
      maxOutputTokens,
      tooltip: `${model.repoId}/${model.fileName}`,
      detail: model.displayName,
      capabilities: {
        toolCalling: false,
        imageInput: false
      }
    };

    // Undocumented VS Code API: without this, the model may not appear in the picker.
    (info as vscode.LanguageModelChatInformation & { isUserSelectable?: boolean }).isUserSelectable = true;
    return [info];
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    _options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const installed = this.readInstalledModel();
    if (!installed) {
      throw new Error(NO_INSTALLED_MODEL_MESSAGE);
    }

    // Serve only a running session — never start one. A lazy start here was
    // the one start path outside the setup lock: it could resurrect a model
    // the user just switched away from, and it silently reversed an explicit
    // Turn Off / Free Memory by reloading tens of GB on a chat request. Off
    // means off; the honest answer is an error that says how to turn it on.
    const running = this.runtime.activeSession();
    if (!running) {
      throw new Error(LOCAL_AGENT_OFF_MESSAGE);
    }
    await streamChatCompletion(
      running.upstreamBaseUrl ?? running.baseUrl ?? "",
      model.id,
      running.apiKey,
      toOpenAiMessages(messages),
      progress,
      token
    );
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    const value = typeof text === "string" ? text : messageContentToText(text);
    return Math.ceil(value.length / 4);
  }
}

function toOpenAiMessages(messages: readonly vscode.LanguageModelChatRequestMessage[]): OpenAiMessage[] {
  return messages.map((message) => ({
    role: message.role === vscode.LanguageModelChatMessageRole.Assistant ? "assistant" : "user",
    content: messageContentToText(message)
  }));
}

function messageContentToText(message: vscode.LanguageModelChatRequestMessage): string {
  return message.content
    .map((part) => {
      if (part instanceof vscode.LanguageModelTextPart) {
        return part.value;
      }
      if (part && typeof part === "object" && "value" in part && typeof part.value === "string") {
        return part.value;
      }
      return "";
    })
    .join("");
}
