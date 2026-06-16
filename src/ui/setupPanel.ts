import * as crypto from "node:crypto";
import * as vscode from "vscode";
import { LocalMotionController } from "../app/localMotionController";
import { isCursorSetupValueKey } from "../cursor/cursorIntegration";
import type { AutomagicalSetupCompleteResponse, SetupRequest, SetupResponse } from "../setupProtocol";
import { shouldPostInitialQuantizations } from "../setupPolicy";
import { setupPanelHtml } from "./setupPanelHtml";
import type { CandidateQuantization } from "../types";

export class SetupPanel {
  private static current: SetupPanel | undefined;
  private readonly readyPromise: Promise<void>;
  private resolveReady: (() => void) | undefined;
  private isReady = false;
  private setupOperationActive = false;

  static show(
    controller: LocalMotionController,
    output: vscode.OutputChannel
  ): SetupPanel {
    if (SetupPanel.current) {
      SetupPanel.current.panel.reveal(vscode.ViewColumn.One);
      void SetupPanel.current.postInitialState();
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
    private readonly controller: LocalMotionController,
    private readonly output: vscode.OutputChannel
  ) {
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.panel.webview.html = this.html();
    this.panel.onDidDispose(() => {
      SetupPanel.current = undefined;
    });
    this.panel.webview.onDidReceiveMessage((message: SetupRequest) => void this.handleMessage(message));
  }

  private async handleMessage(message: SetupRequest): Promise<void> {
    try {
      switch (message.command) {
        case "ready":
          await this.postInitialRuntimeState();
          this.markReady();
          if (shouldPostInitialQuantizations({ setupOperationActive: this.setupOperationActive })) {
            await this.postDefaultQuantizations();
          }
          break;
        case "search":
          await this.post(await this.controller.search(message.query ?? ""));
          break;
        case "quantizations":
          await this.post(await this.controller.quantizations(message.repoId ?? this.controller.defaultRepo()));
          break;
        case "installRun":
          if (!message.candidate) {
            throw new Error("No quantization was selected.");
          }
          await this.installRun(message.candidate);
          break;
        case "automagicalSetup":
          await this.automagicalSetup();
          break;
        case "stop":
          await this.post(await this.controller.stop());
          break;
        case "prepareCursor":
          await this.post(await this.controller.prepareCursor());
          break;
        case "copyCursorValue":
          if (!isCursorSetupValueKey(message.key)) {
            throw new Error("No Cursor setup value was selected.");
          }
          await this.post(await this.controller.copyCursorValue(message.key));
          break;
        case "verifyCursorEndpoint":
          await this.post(await this.controller.verifyCursorEndpoint());
          break;
        case "openCursorSettings":
          await this.post(await this.controller.openCursorSettings());
          break;
        default:
          throw new Error("Unknown setup command.");
      }
    } catch (error) {
      await this.reportError(error);
    }
  }

  private async postInitialState(): Promise<void> {
    await this.postInitialRuntimeState();
    if (shouldPostInitialQuantizations({ setupOperationActive: this.setupOperationActive })) {
      await this.postDefaultQuantizations();
    }
  }

  private async postInitialRuntimeState(): Promise<void> {
    await this.post(await this.controller.initialState());
  }

  private async postDefaultQuantizations(): Promise<void> {
    await this.post(await this.controller.quantizations(this.controller.defaultRepo()));
  }

  private async installRun(candidate: CandidateQuantization): Promise<void> {
    const payload = await this.controller.installRun(candidate, (progress) => {
      void this.post({ type: "installProgress", progress });
    });
    if (payload) {
      await this.post(payload);
    }
  }

  private async automagicalSetup(): Promise<AutomagicalSetupCompleteResponse | undefined> {
    this.setupOperationActive = true;
    try {
      await this.waitUntilReady();
      await this.post({ type: "automagicalSetupStarted" });
      const payload = await this.controller.automagicalSetup((progress) => {
        void this.post({ type: "installProgress", progress });
      });
      if (payload) {
        await this.post(payload);
      }
      return payload;
    } finally {
      this.setupOperationActive = false;
    }
  }

  private async hostStartedAutomagicalSetup(): Promise<AutomagicalSetupCompleteResponse | undefined> {
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
    await this.post({ type: "error", message: messageText });
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
    await this.panel.webview.postMessage(payload);
  }

  private html(): string {
    return setupPanelHtml(crypto.randomBytes(16).toString("hex"));
  }

}
