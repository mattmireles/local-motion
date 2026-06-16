import * as vscode from "vscode";
import type { InstalledModel } from "../types";
import type { OpenAiMessage } from "../runtime/openAiChat";
import { streamChatCompletion } from "../runtime/openAiStream";
import { LlamaServerManager } from "../runtime/llamaServer";
import { LlamaServerResolver } from "../runtime/llamaServerResolver";

export class LocalMotionProvider implements vscode.LanguageModelChatProvider<vscode.LanguageModelChatInformation> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this.changeEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly runtime: LlamaServerManager,
    private readonly resolver: LlamaServerResolver,
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

    const info: vscode.LanguageModelChatInformation = {
      id: model.modelId,
      name: model.displayName,
      family: "local-gguf",
      version: model.fileName,
      maxInputTokens: model.contextTokens,
      maxOutputTokens: 4096,
      tooltip: `${model.repoId}/${model.fileName}`,
      detail: "Local Motion",
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
      throw new Error("No Local Motion model is installed. Run Local Motion: Open Setup first.");
    }

    const llamaServerPath = await this.resolver.resolve({ allowInstall: false, token });
    const running = await this.runtime.start(installed, llamaServerPath, token);
    await streamChatCompletion(
      running.upstreamBaseUrl ?? running.baseUrl ?? "",
      model.id,
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
