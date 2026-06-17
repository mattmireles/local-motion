import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { CursorSetupValueKey } from "../cursor/cursorIntegration";
import { CursorSetupWorkflow } from "../cursor/cursorSetupWorkflow";
import { setupDiagnosticSummary, type SetupDiagnosticSummary } from "../diagnostics/setupDiagnostics";
import { meetsAutomagicalQualityFloor, selectBestCompatibleQuantization } from "../models/compatibility";
import { automagicalModelRepos, DEFAULT_MODEL_REPO, normalizeHuggingFaceRepoId } from "../models/defaultRepos";
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
    const cursor = await this.cursorSetup.prepareCursorAndMarkCompleted();

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
      const installedModel = await this.reusableInstalledModel({ requireCurrentDefault: true });
      if (installedModel) {
        await this.startInstalledModel(installedModel, {
          allowInstall: allowLlamaInstallForAutomagicalStart("explicit")
        });
      } else {
        await this.installAndStart(await this.automagicalCandidate(), onProgress);
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
    return { type: "runtime", runtime, cursorSetupViewModel: cursorSetup.viewModel, cursorSetupFreshness: cursorSetup.freshness };
  }

  private async completeAutomagicalSetup(): Promise<AutomagicalSetupCompleteResponse> {
    const cursor = await this.cursorSetup.prepareCursorAndMarkCompleted();
    const runtime = this.runtime.status();
    const cursorSetup = this.cursorSetup.payload(runtime);
    return {
      type: "automagicalSetupComplete",
      installed: this.state.installedModel(),
      runtime,
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
    return { type: "runtime", runtime, cursorSetupViewModel: cursorSetup.viewModel, cursorSetupFreshness: cursorSetup.freshness };
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
    this.provider.refresh();
    return installed;
  }

  private async startInstalledModel(
    installed: InstalledModel,
    options: { allowInstall: boolean }
  ): Promise<RuntimeSession> {
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
}
