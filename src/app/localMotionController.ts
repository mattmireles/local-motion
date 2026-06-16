import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  automagicalSetupCompletion,
  cursorSetupFreshness,
  cursorSetupValue,
  cursorSetupViewModel,
  lastCopiedCursorSetup,
  shouldMarkAutomagicalSetupCompleted,
  shouldPersistCursorSetupCopy,
  type CursorSetupValueKey,
  type CursorSetupViewModel
} from "../cursor/cursorIntegration";
import { selectBestCompatibleQuantization } from "../models/compatibility";
import { listQuantizations, searchModels } from "../models/huggingFace";
import { canReuseInstalledModel } from "../models/installedModel";
import { LocalMotionProvider } from "../provider/localMotionProvider";
import { downloadGguf, type DownloadProgress } from "../runtime/downloader";
import { LlamaServerManager } from "../runtime/llamaServer";
import { LlamaServerResolver } from "../runtime/llamaServerResolver";
import type {
  AutomagicalSetupCompleteResponse,
  CursorActionResult,
  CursorCopyResult,
  CursorEndpointVerification,
  CursorSettingsOpened,
  CursorSetupPreparedResponse,
  InstalledResponse,
  QuantizationsResponse,
  RuntimeResponse,
  SearchResultsResponse,
  SetupStateResponse
} from "../setupProtocol";
import { allowLlamaInstallForAutomagicalStart } from "../setupPolicy";
import { LocalMotionState } from "../state";
import { profileMachine } from "../system/machineProfile";
import type { CandidateQuantization, InstalledModel, RuntimeSession } from "../types";
import { formatBytes, modelDisplayName, safeId } from "../util/format";

export const DEFAULT_MODEL_REPO = "yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF";
const CURSOR_ENDPOINT_VERIFY_TIMEOUT_MS = 5_000;

export class LocalMotionController {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly state: LocalMotionState,
    private readonly runtime: LlamaServerManager,
    private readonly resolver: LlamaServerResolver,
    private readonly provider: LocalMotionProvider
  ) {}

  async initialState(): Promise<SetupStateResponse> {
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

  async search(query: string): Promise<SearchResultsResponse> {
    const results = await searchModels(query.trim() || this.defaultRepo());
    return { type: "searchResults", results };
  }

  async quantizations(repoId: string): Promise<QuantizationsResponse> {
    const quantizations = await this.defaultQuantizations(repoId.trim());
    return { type: "quantizations", repoId, quantizations };
  }

  async installRun(
    candidate: CandidateQuantization,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<InstalledResponse | undefined> {
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

    const installed = await this.installAndStart(candidate, onProgress);
    const cursor = await this.prepareCursorAndMarkCompleted();

    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);
    return {
      type: "installed",
      installed,
      runtime,
      cursorSetupViewModel: cursorSetup.viewModel,
      cursorSetupFreshness: cursorSetup.freshness,
      cursor
    };
  }

  async automagicalSetup(
    onProgress: (progress: DownloadProgress) => void
  ): Promise<AutomagicalSetupCompleteResponse | undefined> {
    if (!this.runtime.status().running) {
      const installedModel = await this.reusableInstalledModel();
      if (installedModel) {
        await this.startInstalledModel(installedModel, {
          allowInstall: allowLlamaInstallForAutomagicalStart("explicit")
        });
      } else {
        const repoId = this.defaultRepo();
        const candidate = selectBestCompatibleQuantization(await this.defaultQuantizations(repoId));
        if (!candidate) {
          throw new Error(`No compatible GGUF quantization found in ${repoId} for this Mac.`);
        }
        await this.installAndStart(candidate, onProgress);
      }
    }

    return this.completeAutomagicalSetup();
  }

  async resumeAutomagicalSetup(): Promise<AutomagicalSetupCompleteResponse | undefined> {
    const resumed = await this.resumeAutomagicalRuntime();
    if (!resumed) {
      return undefined;
    }

    return this.completeAutomagicalSetup();
  }

  async resumeAutomagicalRuntime(): Promise<RuntimeResponse | undefined> {
    if (!this.runtime.status().running) {
      const installedModel = await this.reusableInstalledModel();
      if (!installedModel) {
        return undefined;
      }
      await this.startInstalledModel(installedModel, {
        allowInstall: allowLlamaInstallForAutomagicalStart("startupResume")
      });
    }

    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);
    return { type: "runtime", runtime, cursorSetupViewModel: cursorSetup.viewModel, cursorSetupFreshness: cursorSetup.freshness };
  }

  private async completeAutomagicalSetup(): Promise<AutomagicalSetupCompleteResponse> {
    const cursor = await this.prepareCursorAndMarkCompleted();
    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);
    return {
      type: "automagicalSetupComplete",
      installed: this.state.installedModel(),
      runtime,
      cursorSetupViewModel: cursorSetup.viewModel,
      cursorSetupFreshness: cursorSetup.freshness,
      cursor
    };
  }

  async stop(): Promise<RuntimeResponse> {
    await this.runtime.stop();
    this.provider.refresh();
    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);
    return { type: "runtime", runtime, cursorSetupViewModel: cursorSetup.viewModel, cursorSetupFreshness: cursorSetup.freshness };
  }

  async prepareCursor(): Promise<CursorSetupPreparedResponse> {
    const viewModel = this.currentCursorSetupViewModel();
    const verification = await this.verifyCurrentCursorEndpoint(viewModel);
    if (!verification.ok) {
      return {
        type: "cursorSetupPrepared",
        viewModel,
        cursorSetupFreshness: this.currentCursorSetupFreshness(viewModel),
        verification,
        copy: { ok: false, message: "Setup block was not copied because endpoint verification failed." },
        settings: {
          type: "cursorSettingsOpened",
          ok: false,
          message: "Cursor settings were not opened because endpoint verification failed."
        }
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

  async prepareCursorAfterStartingInstalledModel(): Promise<CursorSetupPreparedResponse> {
    if (!this.runtime.status().running) {
      const installedModel = await this.reusableInstalledModel();
      if (installedModel) {
        await this.startInstalledModel(installedModel, {
          allowInstall: allowLlamaInstallForAutomagicalStart("explicit")
        });
      }
    }

    return this.prepareCursor();
  }

  private async prepareCursorAndMarkCompleted(): Promise<CursorSetupPreparedResponse> {
    const cursor = await this.prepareCursor();
    if (shouldMarkAutomagicalSetupCompleted({
      endpointVerified: cursor.verification.ok,
      setupCopied: cursor.copy.ok,
      settingsOpened: cursor.settings.ok
    }) && cursor.cursorSetupFreshness.lastCopied) {
      await this.state.markAutomagicalSetupCompleted(
        automagicalSetupCompletion(cursor.cursorSetupFreshness.lastCopied, new Date().toISOString())
      );
    }

    return cursor;
  }

  async copyCursorValue(key: CursorSetupValueKey): Promise<CursorCopyResult> {
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

  async openCursorSettings(): Promise<CursorSettingsOpened> {
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

  private async defaultQuantizations(repoId: string): Promise<CandidateQuantization[]> {
    const machine = await profileMachine(this.context.globalStorageUri.fsPath);
    const contextTokens = vscode.workspace.getConfiguration("localMotion").get<number>("contextTokens", 8192);
    return listQuantizations(repoId, machine, contextTokens);
  }

  private async installAndStart(
    candidate: CandidateQuantization,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<InstalledModel> {
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

    await this.startInstalledModel(installed, {
      allowInstall: allowLlamaInstallForAutomagicalStart("explicit")
    });
    await this.state.setInstalledModel(installed);
    return installed;
  }

  private async startInstalledModel(
    installed: InstalledModel,
    options: { allowInstall: boolean }
  ): Promise<RuntimeSession> {
    const llamaServerPath = await this.resolver.resolve({ allowInstall: options.allowInstall });
    const session = await this.runtime.start(installed, llamaServerPath);
    this.provider.refresh();
    await vscode.window.showInformationMessage(`${session.displayName} is running locally.`);
    return session;
  }

  private async modelFileSize(modelPath: string): Promise<number | undefined> {
    try {
      const stat = await fs.promises.stat(modelPath);
      return stat.isFile() ? stat.size : undefined;
    } catch {
      return undefined;
    }
  }

  private async reusableInstalledModel(): Promise<InstalledModel | undefined> {
    const installedModel = this.state.installedModel();
    return canReuseInstalledModel(
      installedModel,
      installedModel ? await this.modelFileSize(installedModel.modelPath) : undefined
    )
      ? installedModel
      : undefined;
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
