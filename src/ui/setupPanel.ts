import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { LocalMotionController } from "../app/localMotionController";
import { isCursorSetupValueKey } from "../cursor/cursorIntegration";
import type { LocalModelOptionId } from "../models/defaultRepos";
import { SETUP_REQUEST_COMMAND, SETUP_RESPONSE_TYPE, type AutomagicalSetupCompleteResponse, type SetupRequest, type SetupResponse } from "../setupProtocol";
import { setupPanelHtml } from "./setupPanelHtml";
import type { DownloadProgress } from "../runtime/downloader";

export class SetupPanel {
  private static current: SetupPanel | undefined;
  private readonly session: SetupWebviewSession;

  static show(
    controller: LocalMotionController,
    output: vscode.OutputChannel
  ): SetupPanel {
    if (SetupPanel.current) {
      SetupPanel.current.panel.reveal(vscode.ViewColumn.One);
      void SetupPanel.current.session.postInitialState();
      return SetupPanel.current;
    }

    const panel = vscode.window.createWebviewPanel("localMotionSetup", "Local Motion", vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: []
    });
    SetupPanel.current = new SetupPanel(panel, controller, output);
    return SetupPanel.current;
  }

  static async runAutomagicalSetup(
    controller: LocalMotionController,
    output: vscode.OutputChannel
  ): Promise<AutomagicalSetupCompleteResponse | undefined> {
    return SetupPanel.show(controller, output).hostStartedAutomagicalSetup();
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    controller: LocalMotionController,
    output: vscode.OutputChannel
  ) {
    this.session = new SetupWebviewSession(this.panel.webview, controller, output);
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: []
    };
    this.panel.onDidDispose(() => {
      SetupPanel.current = undefined;
    });
  }

  private async hostStartedAutomagicalSetup(): Promise<AutomagicalSetupCompleteResponse | undefined> {
    return this.session.hostStartedAutomagicalSetup();
  }
}

export class SetupViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "localMotion.agentView";
  private static readonly containerCommand = "workbench.view.extension.localMotion";
  private session: SetupWebviewSession | undefined;
  private viewResolve: (() => void) | undefined;
  private viewPromise: Promise<void> | undefined;

  constructor(
    private readonly controller: LocalMotionController,
    private readonly output: vscode.OutputChannel
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: []
    };
    this.session = new SetupWebviewSession(webviewView.webview, this.controller, this.output);
    this.viewResolve?.();
    this.viewPromise = undefined;
    this.viewResolve = undefined;
    webviewView.onDidDispose(() => {
      this.session = undefined;
    });
  }

  async show(): Promise<void> {
    await vscode.commands.executeCommand(SetupViewProvider.containerCommand);
    await this.waitForView();
    await this.refresh();
  }

  async refresh(): Promise<void> {
    await this.session?.postInitialState();
  }

  async runAutomagicalSetup(onShown: () => Promise<void> = async () => undefined): Promise<AutomagicalSetupCompleteResponse | undefined> {
    await vscode.commands.executeCommand(SetupViewProvider.containerCommand);
    await this.waitForView();
    await onShown();
    if (this.session) {
      return this.session.hostStartedAutomagicalSetup();
    }
    return SetupPanel.runAutomagicalSetup(this.controller, this.output);
  }

  private async waitForView(): Promise<void> {
    if (this.session) {
      return;
    }
    if (!this.viewPromise) {
      this.viewPromise = new Promise((resolve) => {
        this.viewResolve = resolve;
      });
    }
    await Promise.race([
      this.viewPromise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 3_000);
      })
    ]);
  }
}

class SetupWebviewSession {
  private readonly readyPromise: Promise<void>;
  private resolveReady: (() => void) | undefined;
  private isReady = false;
  private setupOperationActive = false;

  constructor(
    private readonly webview: vscode.Webview,
    private readonly controller: LocalMotionController,
    private readonly output: vscode.OutputChannel
  ) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.webview.html = this.html();
    this.webview.onDidReceiveMessage((message: SetupRequest) => void this.handleMessage(message));
  }

  private async handleMessage(message: SetupRequest): Promise<void> {
    try {
      switch (message.command) {
        case SETUP_REQUEST_COMMAND.READY:
          await this.postInitialRuntimeState();
          this.markReady();
          break;
        case SETUP_REQUEST_COMMAND.AUTOMAGICAL_SETUP:
          await this.automagicalSetup(message.modelOptionId);
          break;
        case SETUP_REQUEST_COMMAND.STOP:
          await this.post(await this.controller.stop());
          break;
        case SETUP_REQUEST_COMMAND.START_DOWNLOADED_MODEL:
          if (this.setupOperationActive) {
            throw new Error("Wait for setup to finish before switching models.");
          }
          if (!message.id) {
            throw new Error("No downloaded model was selected.");
          }
          {
            const id = message.id;
            await this.withSetupOperation(async () => {
              await this.post(await this.controller.startDownloadedModel(id));
            });
          }
          break;
        case SETUP_REQUEST_COMMAND.REPLACE_MODEL_OPTION:
          if (this.setupOperationActive) {
            throw new Error("Wait for setup to finish before replacing models.");
          }
          if (message.modelOptionId !== "max" && message.modelOptionId !== "mini") {
            throw new Error("No model slot was selected.");
          }
          if (!message.repoId?.trim()) {
            throw new Error("Paste a Hugging Face GGUF repository.");
          }
          {
            const optionId = message.modelOptionId;
            const repoId = message.repoId;
            await this.withSetupOperation(async () => {
              const { onProgress, onModelSelected } = this.installProgressCallbacks();
              await this.post(await this.controller.replaceModelOption(optionId, repoId, onProgress, onModelSelected));
            });
          }
          break;
        case SETUP_REQUEST_COMMAND.SELECT_QUANTIZATION:
          if (this.setupOperationActive) {
            throw new Error("Wait for setup to finish before changing quantization.");
          }
          if (message.modelOptionId !== "max" && message.modelOptionId !== "mini") {
            throw new Error("No model slot was selected.");
          }
          if (!message.fileName) {
            throw new Error("No quantization was selected.");
          }
          await this.post(await this.controller.selectQuantization(message.modelOptionId, message.fileName));
          break;
        case SETUP_REQUEST_COMMAND.DELETE_DOWNLOADED_MODEL:
          if (this.setupOperationActive) {
            throw new Error("Wait for setup to finish before deleting downloaded models.");
          }
          if (!message.id) {
            throw new Error("No downloaded model was selected.");
          }
          {
            const payload = await this.controller.deleteDownloadedModel(message.id);
            if (payload) {
              await this.post(payload);
            }
          }
          break;
        case SETUP_REQUEST_COMMAND.CONNECT_CURSOR:
          await this.post(await this.controller.connectCursor());
          break;
        case SETUP_REQUEST_COMMAND.PREPARE_CURSOR:
          await this.post(await this.controller.prepareCursor());
          break;
        case SETUP_REQUEST_COMMAND.COPY_CURSOR_VALUE:
          if (!isCursorSetupValueKey(message.key)) {
            throw new Error("No Cursor setup value was selected.");
          }
          await this.post(await this.controller.copyCursorValue(message.key));
          break;
        default:
          throw new Error("Unknown setup command.");
      }
    } catch (error) {
      await this.reportError(error);
    }
  }

  async postInitialState(): Promise<void> {
    await this.postInitialRuntimeState();
  }

  private async postInitialRuntimeState(): Promise<void> {
    await this.post(await this.controller.initialState());
  }

  private async withSetupOperation<T>(run: () => Promise<T>): Promise<T> {
    this.setupOperationActive = true;
    try {
      return await run();
    } finally {
      this.setupOperationActive = false;
    }
  }

  private installProgressCallbacks(): {
    onProgress: (progress: DownloadProgress, modelName?: string) => void;
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void;
  } {
    return {
      onProgress: (progress, modelName) => {
        void this.post({ type: SETUP_RESPONSE_TYPE.INSTALL_PROGRESS, progress, modelName });
      },
      onModelSelected: (modelName, requiredMemory, availableMemory) => {
        void this.post({ type: SETUP_RESPONSE_TYPE.INSTALL_MODEL_SELECTED, modelName, requiredMemory, availableMemory });
      }
    };
  }

  private async automagicalSetup(modelOptionId?: LocalModelOptionId): Promise<AutomagicalSetupCompleteResponse | undefined> {
    return this.withSetupOperation(async () => {
      await this.waitUntilReady();
      await this.post({ type: SETUP_RESPONSE_TYPE.AUTOMAGICAL_SETUP_STARTED });
      const { onProgress, onModelSelected } = this.installProgressCallbacks();
      const payload = await this.controller.automagicalSetup(onProgress, onModelSelected, modelOptionId);
      if (payload) {
        await this.post(payload);
      }
      return payload;
    });
  }

  async hostStartedAutomagicalSetup(): Promise<AutomagicalSetupCompleteResponse | undefined> {
    try {
      return await this.automagicalSetup();
    } catch (error) {
      await this.reportError(error);
      throw error;
    }
  }

  private async reportError(error: unknown): Promise<void> {
    const messageText = error instanceof Error ? error.message : String(error);
    this.output.appendLine(messageText);
    await this.postInitialRuntimeState().catch(() => undefined);
    await this.post({ type: SETUP_RESPONSE_TYPE.ERROR, message: messageText });
    void vscode.window.showErrorMessage(messageText);
  }

  private markReady(): void {
    if (this.isReady) {
      return;
    }
    this.isReady = true;
    this.resolveReady?.();
  }

  private async waitUntilReady(): Promise<void> {
    if (this.isReady) {
      return;
    }
    await Promise.race([
      this.readyPromise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 3_000);
      })
    ]);
  }

  private async post(payload: SetupResponse): Promise<void> {
    await this.webview.postMessage(payload);
  }

  private html(): string {
    return setupPanelHtml(crypto.randomBytes(16).toString("hex"));
  }

}
