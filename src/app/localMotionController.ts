import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  cursorSetupFreshness,
  cursorSetupValue,
  cursorSetupViewModel,
  lastCopiedCursorSetup,
  shouldPersistCursorSetupCopy,
  type CursorSetupValueKey,
  type CursorSetupViewModel
} from "../cursor/cursorIntegration";
import { listQuantizations, searchModels } from "../models/huggingFace";
import { LocalMotionProvider } from "../provider/localMotionProvider";
import { downloadGguf, type DownloadProgress } from "../runtime/downloader";
import { LlamaServerManager } from "../runtime/llamaServer";
import { LlamaServerResolver } from "../runtime/llamaServerResolver";
import { LocalMotionState } from "../state";
import { profileMachine } from "../system/machineProfile";
import type { CandidateQuantization, InstalledModel } from "../types";
import { formatBytes, modelDisplayName, safeId } from "../util/format";

export const DEFAULT_MODEL_REPO = "yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF";
const CURSOR_ENDPOINT_VERIFY_TIMEOUT_MS = 5_000;

interface CursorActionResult {
  ok: boolean;
  message: string;
}

interface CursorEndpointVerification extends CursorActionResult {
  type: "cursorEndpointVerification";
}

export class LocalMotionController {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly state: LocalMotionState,
    private readonly runtime: LlamaServerManager,
    private readonly resolver: LlamaServerResolver,
    private readonly provider: LocalMotionProvider
  ) {}

  async initialState(): Promise<Record<string, unknown>> {
    await fs.promises.mkdir(this.context.globalStorageUri.fsPath, { recursive: true });
    const machine = await profileMachine(this.context.globalStorageUri.fsPath);
    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);

    return {
      type: "state",
      defaultRepo: this.defaultRepo(),
      machine: {
        cpu: machine.cpuBrand,
        arch: machine.arch,
        memory: formatBytes(machine.totalMemoryBytes),
        availableMemory: formatBytes(machine.availableMemoryBytes),
        budget: formatBytes(machine.recommendedModelMemoryBytes),
        disk: formatBytes(machine.availableDiskBytes),
        storageRoot: machine.storageRoot,
        appleSilicon: machine.isAppleSilicon
      },
      installed: this.state.installedModel(),
      runtime,
      cursorSetupViewModel: cursorSetup.viewModel,
      cursorSetupFreshness: cursorSetup.freshness
    };
  }

  async search(query: string): Promise<Record<string, unknown>> {
    const results = await searchModels(query.trim() || this.defaultRepo());
    return { type: "searchResults", results };
  }

  async quantizations(repoId: string): Promise<Record<string, unknown>> {
    const machine = await profileMachine(this.context.globalStorageUri.fsPath);
    const contextTokens = vscode.workspace.getConfiguration("localMotion").get<number>("contextTokens", 8192);
    const quantizations = await listQuantizations(repoId.trim(), machine, contextTokens);
    return { type: "quantizations", repoId, quantizations };
  }

  async installRun(
    candidate: CandidateQuantization,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<Record<string, unknown> | undefined> {
    if (candidate.compatibility.status !== "compatible") {
      const answer = await vscode.window.showWarningMessage(
        "This quantization is marked not compatible for this Mac. Continue anyway?",
        "Continue",
        "Cancel"
      );
      if (answer !== "Continue") {
        return undefined;
      }
    }

    const modelPath = await this.download(candidate, onProgress);
    const contextTokens = vscode.workspace.getConfiguration("localMotion").get<number>("contextTokens", 8192);
    const installed: InstalledModel = {
      repoId: candidate.repoId,
      fileName: candidate.fileName,
      revision: candidate.revision,
      sizeBytes: candidate.sizeBytes,
      modelPath,
      modelId: `local-motion-${safeId(`${candidate.repoId}-${candidate.quantization}`)}`,
      displayName: modelDisplayName(candidate.repoId, candidate.fileName),
      contextTokens
    };

    const llamaServerPath = await this.resolver.resolve({ allowInstall: true });
    const session = await this.runtime.start(installed, llamaServerPath);
    await this.state.setInstalledModel(installed);
    this.provider.refresh();
    await vscode.window.showInformationMessage(`${session.displayName} is running locally.`);

    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);
    return {
      type: "installed",
      installed,
      runtime,
      cursorSetupViewModel: cursorSetup.viewModel,
      cursorSetupFreshness: cursorSetup.freshness
    };
  }

  async stop(): Promise<Record<string, unknown>> {
    await this.runtime.stop();
    this.provider.refresh();
    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);
    return { type: "runtime", runtime, cursorSetupViewModel: cursorSetup.viewModel, cursorSetupFreshness: cursorSetup.freshness };
  }

  async prepareCursor(): Promise<Record<string, unknown>> {
    const viewModel = this.currentCursorSetupViewModel();
    const verification = await this.verifyCurrentCursorEndpoint(viewModel);
    if (!verification.ok) {
      return {
        type: "cursorSetupPrepared",
        viewModel,
        cursorSetupFreshness: this.currentCursorSetupFreshness(viewModel),
        verification,
        copy: { ok: false, message: "Setup block was not copied because endpoint verification failed." },
        settings: { ok: false, message: "Cursor settings were not opened because endpoint verification failed." }
      };
    }
    const copy = await this.writeCursorValue("setupBlock", viewModel);
    let freshness = this.currentCursorSetupFreshness(viewModel);
    if (copy.ok) {
      const copiedAt = new Date().toISOString();
      await this.state.setLastCopiedCursorSetup(lastCopiedCursorSetup(viewModel, "prepareCursor", copiedAt, copiedAt));
      freshness = this.currentCursorSetupFreshness(viewModel);
    }
    const settings = await this.openCursorSettings();
    return { type: "cursorSetupPrepared", viewModel, cursorSetupFreshness: freshness, verification, copy, settings };
  }

  async copyCursorValue(key: CursorSetupValueKey): Promise<Record<string, unknown>> {
    const viewModel = this.currentCursorSetupViewModel();
    const result = await this.writeCursorValue(key, viewModel);
    let freshness = this.currentCursorSetupFreshness(viewModel);
    if (shouldPersistCursorSetupCopy(key, result.ok)) {
      await this.state.setLastCopiedCursorSetup(lastCopiedCursorSetup(viewModel, "copySetupBlock", new Date().toISOString()));
      freshness = this.currentCursorSetupFreshness(viewModel);
    }
    return { type: "cursorCopyResult", key, cursorSetupFreshness: freshness, ...result };
  }

  async verifyCursorEndpoint(): Promise<CursorEndpointVerification> {
    return this.verifyCurrentCursorEndpoint(this.currentCursorSetupViewModel());
  }

  async openCursorSettings(): Promise<Record<string, unknown>> {
    if (!this.currentCursorSetupViewModel().isRunning) {
      return { type: "cursorSettingsOpened", ok: false, message: "Start a local model before opening Cursor Models settings." };
    }
    try {
      await vscode.commands.executeCommand("workbench.action.openSettings", "Cursor Models");
      return { type: "cursorSettingsOpened", ok: true, message: "Opened Settings filtered to Cursor Models." };
    } catch (error) {
      return {
        type: "cursorSettingsOpened",
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  defaultRepo(): string {
    return vscode.workspace
      .getConfiguration("localMotion")
      .get<string>("defaultModelRepo", DEFAULT_MODEL_REPO)
      .trim();
  }

  private async download(
    candidate: CandidateQuantization,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<string> {
    const modelsRoot = path.join(this.context.globalStorageUri.fsPath, "models");
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Downloading ${candidate.quantization}`,
        cancellable: true
      },
      async (progress, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        let lastPercent = 0;
        return downloadGguf(
          candidate,
          modelsRoot,
          (downloadProgress) => {
            const percent = downloadProgress.percent ?? 0;
            progress.report({
              increment: Math.max(0, percent - lastPercent),
              message: `${formatBytes(downloadProgress.downloadedBytes)} / ${formatBytes(downloadProgress.totalBytes)}`
            });
            lastPercent = percent;
            onProgress(downloadProgress);
          },
          controller.signal
        );
      }
    );
  }

  private currentCursorSetupViewModel(): CursorSetupViewModel {
    return cursorSetupViewModel(this.runtime.status());
  }

  private cursorSetupPayload(runtime: ReturnType<LlamaServerManager["status"]>): {
    viewModel: CursorSetupViewModel;
    freshness: ReturnType<typeof cursorSetupFreshness>;
  } {
    const viewModel = cursorSetupViewModel(runtime);
    return {
      viewModel,
      freshness: this.currentCursorSetupFreshness(viewModel)
    };
  }

  private currentCursorSetupFreshness(viewModel: CursorSetupViewModel): ReturnType<typeof cursorSetupFreshness> {
    return cursorSetupFreshness(viewModel, this.state.lastCopiedCursorSetup());
  }

  private async writeCursorValue(key: CursorSetupValueKey, viewModel: CursorSetupViewModel): Promise<CursorActionResult> {
    if (!viewModel.isRunning && key !== "apiKey") {
      return { ok: false, message: "Start a local model before copying Cursor setup values." };
    }
    try {
      await vscode.env.clipboard.writeText(cursorSetupValue(viewModel, key));
      return { ok: true, message: copyMessage(key) };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async verifyCurrentCursorEndpoint(viewModel: CursorSetupViewModel): Promise<CursorEndpointVerification> {
    if (!viewModel.isRunning) {
      return { type: "cursorEndpointVerification", ok: false, message: "Start a local model before verifying Cursor setup." };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CURSOR_ENDPOINT_VERIFY_TIMEOUT_MS);
    try {
      const response = await fetch(`${viewModel.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${viewModel.apiKey}` },
        signal: controller.signal
      });
      if (!response.ok) {
        return {
          type: "cursorEndpointVerification",
          ok: false,
          message: `Local Motion endpoint returned HTTP ${response.status}. Copy API key "${viewModel.apiKey}" and verify the model is still running.`
        };
      }

      const payload = await response.json() as { data?: Array<{ id?: unknown }> };
      const modelIds = Array.isArray(payload.data)
        ? payload.data.map((model) => model.id).filter((id): id is string => typeof id === "string")
        : [];
      if (!modelIds.includes(viewModel.modelId)) {
        return {
          type: "cursorEndpointVerification",
          ok: false,
          message: `Local Motion endpoint is running, but model "${viewModel.modelId}" was not listed.`
        };
      }

      return {
        type: "cursorEndpointVerification",
        ok: true,
        message: `Verified ${viewModel.modelId} at ${viewModel.baseUrl}.`
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          type: "cursorEndpointVerification",
          ok: false,
          message: "Local Motion endpoint did not respond within 5 seconds."
        };
      }
      return {
        type: "cursorEndpointVerification",
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function copyMessage(key: CursorSetupValueKey): string {
  switch (key) {
    case "apiKey":
      return "Copied API key.";
    case "baseUrl":
      return "Copied Base URL.";
    case "modelId":
      return "Copied model ID.";
    case "setupBlock":
      return "Copied full Cursor setup block.";
  }
}
