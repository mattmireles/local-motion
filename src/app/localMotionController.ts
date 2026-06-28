import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { CursorSetupValueKey } from "../cursor/cursorIntegration";
import { CursorSetupWorkflow } from "../cursor/cursorSetupWorkflow";
import { setupDiagnosticSummary, type SetupDiagnosticSummary } from "../diagnostics/setupDiagnostics";
import { classifyCompatibility, meetsAutomagicalQualityFloor, parameterCountFromText, quantizationFromFileName, selectBestCompatibleQuantization } from "../models/compatibility";
import { automagicalModelRepos, DEFAULT_MODEL_REPO, normalizeHuggingFaceRepoId } from "../models/defaultRepos";
import { deleteDownloadedModel, listDownloadedModels } from "../models/downloadedModels";
import { listQuantizations, searchModels } from "../models/huggingFace";
import { canReuseInstalledModel, canReuseInstalledModelForDefault } from "../models/installedModel";
import { hasCompletedAutomagicalSetupForInstalledModel } from "../onboarding";
import { LocalMotionProvider } from "../provider/localMotionProvider";
import { downloadGguf, type DownloadProgress } from "../runtime/downloader";
import { LlamaServerManager } from "../runtime/llamaServer";
import { LlamaServerResolver } from "../runtime/llamaServerResolver";
import type {
  AutomagicalSetupCompleteResponse,
  CursorCopyResult,
  CursorEndpointVerification,
  CursorSetupPreparedResponse,
  InstalledResponse,
  QuantizationsResponse,
  RuntimeResponse,
  SearchResultsResponse,
  SetupInstalledModelView,
  SetupStoragePayload,
  SetupStateResponse
} from "../setupProtocol";
import { allowLlamaInstallForAutomagicalStart } from "../setupPolicy";
import { LocalMotionState } from "../state";
import { profileMachine } from "../system/machineProfile";
import type { CandidateQuantization, InstalledModel, RuntimeSession } from "../types";
import { formatBytes, modelDisplayName, safeId } from "../util/format";

export class LocalMotionController {
  private readonly cursorSetup: CursorSetupWorkflow;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly state: LocalMotionState,
    private readonly runtime: LlamaServerManager,
    private readonly resolver: LlamaServerResolver,
    private readonly provider: LocalMotionProvider
  ) {
    this.cursorSetup = new CursorSetupWorkflow(
      state,
      () => this.runtime.status(),
      {
        writeClipboardText: async (value) => {
          await vscode.env.clipboard.writeText(value);
        },
        openSettings: async (query) => {
          await vscode.commands.executeCommand("workbench.action.openSettings", query);
        },
        fetch: (input, init) => fetch(input, init),
        now: () => new Date().toISOString()
      }
    );
  }

  async initialState(): Promise<SetupStateResponse> {
    await fs.promises.mkdir(this.context.globalStorageUri.fsPath, { recursive: true });
    const machine = await profileMachine(this.context.globalStorageUri.fsPath);
    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);
    const storage = await this.storagePayload();

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
      installed: this.optionalInstalledModelView(this.state.installedModel()),
      ...storage,
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
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void = () => undefined
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

    const installed = await this.installAndStart(candidate, onProgress, onModelSelected);
    const cursor = await this.cursorSetup.prepareCursorAndMarkCompleted();

    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);
    return {
      type: "installed",
      installed: this.installedModelView(installed),
      runtime,
      ...await this.storagePayload(),
      cursorSetupViewModel: cursorSetup.viewModel,
      cursorSetupFreshness: cursorSetup.freshness,
      cursor
    };
  }

  async automagicalSetup(
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void = () => undefined
  ): Promise<AutomagicalSetupCompleteResponse | undefined> {
    if (!this.runtime.status().running) {
      const installedModel = await this.reusableInstalledModel({ requireCurrentDefault: true });
      if (installedModel) {
        await this.startInstalledModel(installedModel, {
          allowInstall: allowLlamaInstallForAutomagicalStart("explicit")
        });
      } else {
        await this.installAndStart(await this.automagicalCandidate(), onProgress, onModelSelected);
      }
    }

    return this.completeAutomagicalSetup();
  }

  async resumeAutomagicalRuntime(): Promise<RuntimeResponse | undefined> {
    if (!this.runtime.status().running) {
      const installedModel = await this.reusableInstalledModel({ requireCurrentDefault: true });
      if (!installedModel) {
        return undefined;
      }
      await this.startInstalledModel(installedModel, {
        allowInstall: allowLlamaInstallForAutomagicalStart("startupResume")
      });
    }

    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);
    return { type: "runtime", runtime, ...await this.storagePayload(), cursorSetupViewModel: cursorSetup.viewModel, cursorSetupFreshness: cursorSetup.freshness };
  }

  private async completeAutomagicalSetup(): Promise<AutomagicalSetupCompleteResponse> {
    const cursor = await this.cursorSetup.prepareCursorAndMarkCompleted();
    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetup.payload(runtime);
    return {
      type: "automagicalSetupComplete",
      installed: this.optionalInstalledModelView(this.state.installedModel()),
      runtime,
      ...await this.storagePayload(),
      cursorSetupViewModel: cursorSetup.cursorSetupViewModel,
      cursorSetupFreshness: cursorSetup.cursorSetupFreshness,
      cursor
    };
  }

  async stop(): Promise<RuntimeResponse> {
    await this.runtime.stop();
    this.provider.refresh();
    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);
    return { type: "runtime", runtime, ...await this.storagePayload(), cursorSetupViewModel: cursorSetup.viewModel, cursorSetupFreshness: cursorSetup.freshness };
  }

  async deleteDownloadedModel(id: string): Promise<SetupStateResponse | undefined> {
    const downloaded = await this.downloadedModels();
    const model = downloaded.models.find((candidate) => candidate.id === id);
    if (!model) {
      throw new Error("Downloaded model was not found.");
    }

    const runningNotice = model.active ? " This will turn off the local agent first." : "";
    const answer = await vscode.window.showWarningMessage(
      `Delete ${model.fileName} and free ${formatBytes(model.sizeBytes)}?${runningNotice}`,
      { modal: true },
      "Delete"
    );
    if (answer !== "Delete") {
      return undefined;
    }

    if (model.active) {
      await this.runtime.stop();
    }

    const deletedPath = await deleteDownloadedModel(this.modelsRoot(), id);
    const clearedInstalled = await this.state.clearInstalledModelIfPath(deletedPath);
    if (clearedInstalled) {
      await this.state.clearAutomagicalSetupCompletionIfModel(clearedInstalled.modelId);
    }
    this.provider.refresh();
    return this.initialState();
  }

  async prepareCursor(): Promise<CursorSetupPreparedResponse> {
    return this.cursorSetup.prepareCursor();
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

  async copyCursorValue(key: CursorSetupValueKey): Promise<CursorCopyResult> {
    return this.cursorSetup.copyCursorValue(key);
  }

  async verifyCursorEndpoint(): Promise<CursorEndpointVerification> {
    return this.cursorSetup.verifyCursorEndpoint();
  }

  async diagnoseSetup(): Promise<SetupDiagnosticSummary> {
    const installedModel = this.state.installedModel();
    const installedFileValid = installedModel !== undefined &&
      canReuseInstalledModel(installedModel, await this.modelFileSize(installedModel.modelPath));
    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetupPayload(runtime);
    const endpoint = await this.verifyCursorEndpoint();
    return setupDiagnosticSummary({
      installedModelId: installedModel?.modelId,
      installedFileValid,
      runtimeRunning: runtime.running,
      runtimeBaseUrl: runtime.baseUrl,
      runtimeModelId: runtime.modelId,
      endpointVerified: endpoint.ok,
      cursorSetupFreshness: cursorSetup.freshness.status,
      completedForInstalledModel: hasCompletedAutomagicalSetupForInstalledModel(
        installedModel,
        this.state.automagicalSetupCompletion()
      )
    });
  }

  defaultRepo(): string {
    return normalizeHuggingFaceRepoId(vscode.workspace
      .getConfiguration("localMotion")
      .get<string>("defaultModelRepo", DEFAULT_MODEL_REPO)
      .trim()) || DEFAULT_MODEL_REPO;
  }

  automagicalRepos(): string[] {
    return automagicalModelRepos(this.defaultRepo());
  }

  private async download(
    candidate: CandidateQuantization,
    onProgress: (progress: DownloadProgress, modelName?: string) => void
  ): Promise<string> {
    const displayName = modelDisplayName(candidate.repoId, candidate.fileName);
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Downloading ${displayName}`,
        cancellable: true
      },
      async (progress, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());
        let lastPercent = 0;
        const downloadConcurrency = vscode.workspace
          .getConfiguration("localMotion")
          .get<number>("downloadConcurrency", 16);
        return downloadGguf(
          candidate,
          this.modelsRoot(),
          (downloadProgress) => {
            const percent = downloadProgress.percent ?? 0;
            progress.report({
              increment: Math.max(0, percent - lastPercent),
              message: `${formatBytes(downloadProgress.downloadedBytes)} / ${formatBytes(downloadProgress.totalBytes)}`
            });
            lastPercent = percent;
            onProgress(downloadProgress, displayName);
          },
          controller.signal,
          { concurrency: downloadConcurrency }
        );
      }
    );
  }

  private async defaultQuantizations(repoId: string): Promise<CandidateQuantization[]> {
    const machine = await profileMachine(this.context.globalStorageUri.fsPath);
    const contextTokens = vscode.workspace.getConfiguration("localMotion").get<number>("contextTokens", 8192);
    return listQuantizations(repoId, machine, contextTokens);
  }

  private async automagicalCandidate(): Promise<CandidateQuantization> {
    const attempts: string[] = [];
    // The repos are ordered largest -> smallest, so the first one that fits at
    // a healthy (>= 4-bit) quant is the most capable model this Mac can run.
    let fallbackBelowFloor: CandidateQuantization | undefined;
    for (const repoId of this.automagicalRepos()) {
      try {
        const candidate = selectBestCompatibleQuantization(await this.defaultQuantizations(repoId));
        if (!candidate) {
          attempts.push(`${repoId}: no compatible quantization`);
          continue;
        }
        if (meetsAutomagicalQualityFloor(candidate.quantization)) {
          return candidate;
        }
        // This (larger) model only fits when crushed below 4-bit; prefer a
        // smaller model at a healthier quant, but remember it as a last resort.
        fallbackBelowFloor ??= candidate;
        attempts.push(`${repoId}: only ${candidate.quantization} fits, below the quality floor`);
      } catch (error) {
        attempts.push(`${repoId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (fallbackBelowFloor) {
      return fallbackBelowFloor;
    }
    throw new Error(`No compatible GGUF quantization found for this Mac. Tried ${attempts.join("; ")}.`);
  }

  private async installAndStart(
    candidate: CandidateQuantization,
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void
  ): Promise<InstalledModel> {
    const displayName = modelDisplayName(candidate.repoId, candidate.fileName);
    // Report the memory picture for the UI, but do NOT gate the download on it.
    // A multi-GB download takes a long time and current free RAM is irrelevant
    // until the model is actually loaded. The real memory gate lives in
    // startInstalledModel(), which re-checks at load time — so a tight machine
    // still gets the (already-downloaded) model and only has to close apps and
    // turn it on again, with no second download.
    const machine = await profileMachine(this.context.globalStorageUri.fsPath);
    onModelSelected(
      displayName,
      formatBytes(candidate.compatibility.requiredMemoryBytes),
      formatBytes(machine.availableMemoryBytes)
    );
    const modelPath = await this.download(candidate, onProgress);
    const contextTokens = vscode.workspace.getConfiguration("localMotion").get<number>("contextTokens", 8192);
    const installed: InstalledModel = {
      repoId: candidate.repoId,
      fileName: candidate.fileName,
      revision: candidate.revision,
      sizeBytes: candidate.sizeBytes,
      modelPath,
      modelId: `local-motion-${safeId(`${candidate.repoId}-${candidate.quantization}`)}`,
      displayName,
      contextTokens
    };

    await this.startInstalledModel(installed, {
      allowInstall: allowLlamaInstallForAutomagicalStart("explicit")
    });
    await this.state.setInstalledModel(installed);
    this.provider.refresh();
    return installed;
  }

  private async startInstalledModel(
    installed: InstalledModel,
    options: { allowInstall: boolean }
  ): Promise<RuntimeSession> {
    await this.assertReadyToStartInstalledModel(installed);
    const llamaServerPath = await this.resolver.resolve({ allowInstall: options.allowInstall });
    const session = await this.runtime.start(installed, llamaServerPath);
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

  private async reusableInstalledModel(options: { requireCurrentDefault?: boolean } = {}): Promise<InstalledModel | undefined> {
    const installedModel = this.state.installedModel();
    const actualSizeBytes = installedModel ? await this.modelFileSize(installedModel.modelPath) : undefined;
    const reusable = options.requireCurrentDefault
      ? canReuseInstalledModelForDefault(installedModel, actualSizeBytes, this.defaultRepo())
      : canReuseInstalledModel(installedModel, actualSizeBytes);
    return reusable
      ? installedModel
      : undefined;
  }

  private async assertReadyToStartInstalledModel(installed: InstalledModel): Promise<void> {
    const machine = await profileMachine(this.context.globalStorageUri.fsPath);
    const compatibility = classifyCompatibility({
      repoId: installed.repoId,
      fileName: installed.fileName,
      sizeBytes: installed.sizeBytes,
      revision: installed.revision,
      quantization: quantizationFromFileName(installed.fileName),
      parameterCount: parameterCountFromText(`${installed.repoId} ${installed.fileName}`),
      downloadUrl: ""
    }, machine, installed.contextTokens);
    this.assertCurrentMemoryReady(installed.displayName, compatibility.requiredMemoryBytes, machine.availableMemoryBytes);
  }

  private assertCurrentMemoryReady(modelName: string, requiredMemoryBytes: number, availableMemoryBytes: number): void {
    if (requiredMemoryBytes <= availableMemoryBytes) {
      return;
    }
    throw new Error(
      `${modelName} needs about ${formatBytes(requiredMemoryBytes)} of memory to run, but only ${formatBytes(availableMemoryBytes)} is free right now. Close some apps and turn it on again, or choose a smaller size in Advanced.`
    );
  }

  private cursorSetupPayload(runtime: ReturnType<LlamaServerManager["status"]>): {
    viewModel: ReturnType<CursorSetupWorkflow["payload"]>["cursorSetupViewModel"];
    freshness: ReturnType<CursorSetupWorkflow["payload"]>["cursorSetupFreshness"];
  } {
    const payload = this.cursorSetup.payload(runtime);
    return {
      viewModel: payload.cursorSetupViewModel,
      freshness: payload.cursorSetupFreshness
    };
  }

  private modelsRoot(): string {
    return path.join(this.context.globalStorageUri.fsPath, "models");
  }

  private async downloadedModels(): ReturnType<typeof listDownloadedModels> {
    return listDownloadedModels(this.modelsRoot(), {
      installed: this.state.installedModel(),
      active: this.runtime.activeSession()
    });
  }

  private async storagePayload(): Promise<SetupStoragePayload> {
    const downloaded = await this.downloadedModels();
    return {
      downloadedModels: downloaded.models,
      downloadedModelsSizeBytes: downloaded.totalSizeBytes
    };
  }

  private installedModelView(installed: InstalledModel): SetupInstalledModelView {
    return { displayName: installed.displayName };
  }

  private optionalInstalledModelView(installed: InstalledModel | undefined): SetupInstalledModelView | undefined {
    return installed ? this.installedModelView(installed) : undefined;
  }
}
