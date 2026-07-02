import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { cursorTunnelConfigFromWorkspace } from "./cursorTunnelConfig";
import type { CursorSetupValueKey } from "../cursor/cursorIntegration";
import { CursorSetupWorkflow } from "../cursor/cursorSetupWorkflow";
import { setupDiagnosticSummary, type SetupDiagnosticSummary } from "../diagnostics/setupDiagnostics";
import { classifyCompatibility, meetsAutomagicalQualityFloor, parameterCountFromText, quantizationFromFileName, selectBestCompatibleQuantization } from "../models/compatibility";
import {
  DEFAULT_MODEL_REPO,
  LOCAL_MODEL_PACK,
  normalizeHuggingFaceRepoId,
  type LocalModelOptionId
} from "../models/defaultRepos";
import { deleteDownloadedModel, listDownloadedModels, resolveDownloadedModelId } from "../models/downloadedModels";
import { listQuantizations, searchModels } from "../models/huggingFace";
import { canReuseInstalledModel, canReuseInstalledModelForDefault } from "../models/installedModel";
import { hasCompletedAutomagicalSetupForInstalledModel } from "../onboarding";
import { LocalMotionProvider } from "../provider/localMotionProvider";
import { downloadGguf, type DownloadProgress } from "../runtime/downloader";
import { LlamaServerManager } from "../runtime/llamaServer";
import { LlamaServerResolver } from "../runtime/llamaServerResolver";
import {
  SETUP_RESPONSE_TYPE,
  type AutomagicalSetupCompleteResponse,
  type CursorCopyResult,
  type CursorEndpointVerification,
  type CursorSetupPayload,
  type CursorSetupPreparedResponse,
  type InstalledResponse,
  type SetupModelOptionsPayload,
  type SetupModelOptionView,
  type QuantizationsResponse,
  type RuntimeResponse,
  type SearchResultsResponse,
  type SetupInstalledModelView,
  type SetupStoragePayload,
  type SetupStateResponse
} from "../setupProtocol";
import { allowLlamaInstallForAutomagicalStart } from "../setupPolicy";
import { LocalMotionState } from "../state";
import { profileMachine } from "../system/machineProfile";
import { LOCAL_MOTION_MODEL_ID, type CandidateQuantization, type DownloadedModelEntry, type InstalledModel, type RuntimeSession } from "../types";
import { formatBytes, modelDisplayName } from "../util/format";

export class LocalMotionController {
  private readonly cursorSetup: CursorSetupWorkflow;
  private modelOptionCandidates: Promise<Map<LocalModelOptionId, CandidateQuantization | Error>> | undefined;
  private setupOperation: Promise<unknown> | undefined;

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
          // Cursor's Add Custom Model flow lives in Cursor Settings — a
          // separate surface from the VS Code settings editor, opened by a
          // Cursor-only command (confirmed in Cursor's workbench bundle).
          // Plain VS Code lacks that command and falls back to the
          // filtered settings editor.
          try {
            await vscode.commands.executeCommand("cursor.openCursorSettings");
          } catch {
            await vscode.commands.executeCommand("workbench.action.openSettings", query);
          }
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

    return {
      type: SETUP_RESPONSE_TYPE.STATE,
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
      runtime,
      ...await this.responseEnvelope(runtime)
    };
  }

  async search(query: string): Promise<SearchResultsResponse> {
    const results = await searchModels(query.trim() || this.defaultRepo());
    return { type: SETUP_RESPONSE_TYPE.SEARCH_RESULTS, results };
  }

  async quantizations(repoId: string): Promise<QuantizationsResponse> {
    const quantizations = await this.defaultQuantizations(repoId.trim());
    return { type: SETUP_RESPONSE_TYPE.QUANTIZATIONS, repoId, quantizations };
  }

  async installRun(
    candidate: CandidateQuantization,
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void = () => undefined
  ): Promise<InstalledResponse | undefined> {
    return this.withSetupOperation(async () => this.installRunLocked(candidate, onProgress, onModelSelected));
  }

  private async installRunLocked(
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
    const runtime = this.runtime.status();
    return {
      type: SETUP_RESPONSE_TYPE.INSTALLED,
      installed: this.installedModelView(installed),
      runtime,
      ...await this.responseEnvelope(runtime)
    };
  }

  async automagicalSetup(
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void = () => undefined,
    selectedModelOptionId: LocalModelOptionId = "max"
  ): Promise<AutomagicalSetupCompleteResponse | undefined> {
    return this.withSetupOperation(async () => {
      const installedModel = await this.reusableInstalledModelForOption(selectedModelOptionId);
      if (!this.runtime.status().running || !this.isActiveInstalledModel(installedModel)) {
        if (installedModel) {
          await this.startInstalledModel(installedModel, {
            allowInstall: allowLlamaInstallForAutomagicalStart("explicit")
          });
        } else {
          await this.installAndStartAll(await this.automagicalCandidates(), onProgress, onModelSelected, selectedModelOptionId);
        }
      }

      return this.completeAutomagicalSetup();
    });
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
    return { type: SETUP_RESPONSE_TYPE.RUNTIME, runtime, ...await this.responseEnvelope(runtime) };
  }

  private async completeAutomagicalSetup(): Promise<AutomagicalSetupCompleteResponse> {
    const runtime = this.runtime.status();
    return {
      type: SETUP_RESPONSE_TYPE.AUTOMAGICAL_SETUP_COMPLETE,
      installed: this.optionalInstalledModelView(this.state.installedModel()),
      runtime,
      ...await this.responseEnvelope(runtime)
    };
  }

  async stop(): Promise<RuntimeResponse> {
    await this.runtime.stop();
    this.provider.refresh();
    const runtime = this.runtime.status();
    return { type: SETUP_RESPONSE_TYPE.RUNTIME, runtime, ...await this.responseEnvelope(runtime) };
  }

  async replaceModelOption(
    optionId: LocalModelOptionId,
    repoId: string,
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void = () => undefined
  ): Promise<SetupStateResponse> {
    return this.withSetupOperation(async () => this.replaceModelOptionLocked(optionId, repoId, onProgress, onModelSelected));
  }

  private async replaceModelOptionLocked(
    optionId: LocalModelOptionId,
    repoId: string,
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void = () => undefined
  ): Promise<SetupStateResponse> {
    const option = LOCAL_MODEL_PACK.find((candidate) => candidate.id === optionId);
    const normalizedRepo = normalizeHuggingFaceRepoId(repoId);
    if (!option || !normalizedRepo.includes("/")) {
      throw new Error("Paste a Hugging Face GGUF repository like owner/model-GGUF.");
    }

    const candidate = selectBestCompatibleQuantization(await this.defaultQuantizations(normalizedRepo));
    if (!candidate) {
      throw new Error(`No compatible GGUF quantization found for ${normalizedRepo}.`);
    }
    if (!meetsAutomagicalQualityFloor(candidate.quantization)) {
      throw new Error(`${normalizedRepo} only fits at ${candidate.quantization}, below the Q4 automatic floor.`);
    }

    const previous = this.state.modelSlot(optionId);
    const active = this.runtime.activeSession();
    const wasActive = Boolean(previous && active && path.resolve(previous.modelPath) === path.resolve(active.modelPath));
    const installed = await this.installCandidate(candidate, onProgress, onModelSelected);

    await vscode.workspace.getConfiguration("localMotion").update(option.settingKey, normalizedRepo, vscode.ConfigurationTarget.Global);
    this.modelOptionCandidates = undefined;
    await this.state.setModelSlot(optionId, installed);

    if (wasActive) {
      await this.startInstalledModel(installed, {
        allowInstall: allowLlamaInstallForAutomagicalStart("explicit")
      });
      await this.state.setInstalledModel(installed);
      this.provider.refresh();
    }

    return this.initialState();
  }

  /**
   * Manual model switch: run any fully downloaded GGUF from the Storage
   * list. Downloaded files persist after installs, so a user can keep a
   * max-utilization model and a lighter one side by side and flip between
   * them when the machine is loaded — runtime.start() stops the previous
   * server before spawning the new one.
   */
  async startDownloadedModel(id: string): Promise<SetupStateResponse> {
    return this.withSetupOperation(async () => this.startDownloadedModelLocked(id));
  }

  private async startDownloadedModelLocked(id: string): Promise<SetupStateResponse> {
    const downloaded = await this.downloadedModels();
    const model = downloaded.models.find((candidate) => candidate.id === id);
    if (!model) {
      throw new Error("Downloaded model was not found.");
    }
    if (model.partial) {
      throw new Error("That download is incomplete. Finish downloading it or delete it.");
    }
    const modelPath = resolveDownloadedModelId(this.modelsRoot(), id);
    const slottedModel = this.localModelPack()
      .map((option) => this.state.modelSlot(option.id))
      .find((slot) => slot && path.resolve(slot.modelPath) === path.resolve(modelPath));
    const installed: InstalledModel = slottedModel ? {
      ...slottedModel,
      modelId: LOCAL_MOTION_MODEL_ID,
      contextTokens: this.contextTokensSetting()
    } : {
      // The storage id is <safeId(repoId-revision)>/<fileName>; the folder
      // name is the best surviving record of the source repo and is only
      // used for parameter-count inference and display fallbacks.
      repoId: path.dirname(id),
      fileName: model.fileName,
      sizeBytes: model.sizeBytes,
      modelPath,
      modelId: LOCAL_MOTION_MODEL_ID,
      displayName: model.fileName.replace(/\.gguf$/i, ""),
      contextTokens: this.contextTokensSetting()
    };

    await this.startInstalledModel(installed, {
      allowInstall: allowLlamaInstallForAutomagicalStart("explicit")
    });
    await this.state.setInstalledModel(installed);
    this.provider.refresh();
    return this.initialState();
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
    await this.state.clearModelSlotIfPath(deletedPath);
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

  async connectCursor(): Promise<CursorSetupPreparedResponse> {
    const status = this.runtime.status();
    // A running session whose tunnel died (or never came up) can only be
    // healed by a restart — the tunnel child spawns with the model.
    if (status.running && (!status.cursorTunnel?.enabled || !status.cursorTunnel.url)) {
      const active = this.runtime.activeSession();
      if (active) {
        await this.runtime.stop();
        await this.startInstalledModel(active, {
          allowInstall: allowLlamaInstallForAutomagicalStart("explicit"),
          connectCursor: true
        });
      }
    }

    return this.prepareCursorAfterStartingInstalledModel();
  }

  async prepareCursorAfterStartingInstalledModel(): Promise<CursorSetupPreparedResponse> {
    if (!this.runtime.status().running) {
      const installedModel = await this.reusableInstalledModel();
      if (installedModel) {
        await this.startInstalledModel(installedModel, {
          allowInstall: allowLlamaInstallForAutomagicalStart("explicit"),
          connectCursor: true
        });
      }
    }

    return this.cursorSetup.prepareCursorAndMarkCompleted();
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
    return this.localModelPack().map((option) => option.repoId);
  }

  private localModelPack(): Array<typeof LOCAL_MODEL_PACK[number]> {
    const config = vscode.workspace.getConfiguration("localMotion");
    return LOCAL_MODEL_PACK.map((option) => ({
      ...option,
      repoId: normalizeHuggingFaceRepoId(config.get<string>(option.settingKey, option.repoId).trim()) || option.repoId
    }));
  }

  private localModelOptionForRepo(repoId: string): typeof LOCAL_MODEL_PACK[number] | undefined {
    const normalized = normalizeHuggingFaceRepoId(repoId);
    return this.localModelPack().find((option) => option.repoId === normalized);
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
          .get<number>("downloadConcurrency", 24);
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
          {
            concurrency: downloadConcurrency,
            onChecksumWarning: (message) => {
              void vscode.window.showWarningMessage(message);
            }
          }
        );
      }
    );
  }

  private async defaultQuantizations(repoId: string): Promise<CandidateQuantization[]> {
    const machine = await profileMachine(this.context.globalStorageUri.fsPath);
    return listQuantizations(repoId, machine, this.contextTokensSetting());
  }

  private async automagicalCandidates(): Promise<CandidateQuantization[]> {
    const attempts: string[] = [];
    const selected: CandidateQuantization[] = [];
    const candidates = await this.modelOptionCandidateMap();
    for (const option of this.localModelPack()) {
      const candidate = candidates.get(option.id);
      if (candidate && !(candidate instanceof Error)) {
        selected.push(candidate);
      } else {
        attempts.push(`${option.repoId}: ${candidate instanceof Error ? candidate.message : "no compatible quantization"}`);
      }
    }

    if (selected.length === this.localModelPack().length) {
      return selected;
    }
    throw new Error(`Local Motion could not prepare the full Max + Mini pack. Tried ${attempts.join("; ")}.`);
  }

  private async installAndStart(
    candidate: CandidateQuantization,
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void
  ): Promise<InstalledModel> {
    const installed = await this.installCandidate(candidate, onProgress, onModelSelected);

    await this.startInstalledModel(installed, {
      allowInstall: allowLlamaInstallForAutomagicalStart("explicit")
    });
    await this.state.setInstalledModel(installed);
    this.provider.refresh();
    return installed;
  }

  private async installAndStartAll(
    candidates: CandidateQuantization[],
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void,
    selectedModelOptionId: LocalModelOptionId
  ): Promise<InstalledModel> {
    const installedModels: InstalledModel[] = [];
    for (const candidate of candidates) {
      installedModels.push(await this.installCandidate(candidate, onProgress, onModelSelected));
    }
    for (const installedModel of installedModels) {
      const option = this.localModelOptionForRepo(installedModel.repoId);
      if (option) {
        await this.state.setModelSlot(option.id, installedModel);
      }
    }
    const installed = installedModels.find((model) => this.localModelOptionForRepo(model.repoId)?.id === selectedModelOptionId) ?? installedModels[0];
    if (!installed) {
      throw new Error("No compatible GGUF quantization found for this Mac.");
    }
    await this.startInstalledModel(installed, {
      allowInstall: allowLlamaInstallForAutomagicalStart("explicit")
    });
    await this.state.setInstalledModel(installed);
    this.provider.refresh();
    return installed;
  }

  private async installCandidate(
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
    return {
      repoId: candidate.repoId,
      fileName: candidate.fileName,
      revision: candidate.revision,
      sizeBytes: candidate.sizeBytes,
      modelPath,
      modelId: LOCAL_MOTION_MODEL_ID,
      displayName,
      contextTokens: this.contextTokensSetting()
    };
  }

  private async startInstalledModel(
    installed: InstalledModel,
    options: { allowInstall: boolean; connectCursor?: boolean }
  ): Promise<RuntimeSession> {
    const cursorModel = {
      ...installed,
      modelId: LOCAL_MOTION_MODEL_ID,
      contextTokens: this.contextTokensSetting()
    };
    await this.warnIfMemoryTight(cursorModel);
    const llamaServerPath = await this.resolver.resolve({ allowInstall: options.allowInstall });
    const tunnelConfig = options.connectCursor ? cursorTunnelConfigFromWorkspace({ forceCursor: true }) : undefined;
    const session = await this.runtime.start(cursorModel, llamaServerPath, undefined, tunnelConfig).catch((error: unknown) => {
      throw withMemoryHint(error, cursorModel.displayName);
    });
    if (installed.modelId !== LOCAL_MOTION_MODEL_ID || installed.contextTokens !== cursorModel.contextTokens) {
      await this.state.setInstalledModel(cursorModel);
      this.provider.refresh();
    }
    await vscode.window.showInformationMessage(`${session.displayName} is running locally.`);
    return session;
  }

  private isActiveInstalledModel(installed: InstalledModel | undefined): boolean {
    const active = this.runtime.activeSession();
    return Boolean(installed && active && path.resolve(installed.modelPath) === path.resolve(active.modelPath));
  }

  private async withSetupOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.setupOperation) {
      throw new Error("Local Motion setup is already running. Wait for the current setup to finish.");
    }
    const running = operation();
    this.setupOperation = running;
    try {
      return await running;
    } finally {
      if (this.setupOperation === running) {
        this.setupOperation = undefined;
      }
    }
  }

  private async modelFileSize(modelPath: string): Promise<number | undefined> {
    try {
      const stat = await fs.promises.stat(modelPath);
      return stat.isFile() ? stat.size : undefined;
    } catch {
      return undefined;
    }
  }

  private contextTokensSetting(): number {
    return vscode.workspace.getConfiguration("localMotion").get<number>("contextTokens", 8192);
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

  private async reusableInstalledModelForOption(optionId: LocalModelOptionId): Promise<InstalledModel | undefined> {
    const slot = this.state.modelSlot(optionId);
    const actualSizeBytes = slot ? await this.modelFileSize(slot.modelPath) : undefined;
    return canReuseInstalledModel(slot, actualSizeBytes) ? slot : undefined;
  }

  /**
   * Advisory only, never blocking. macOS keeps "free" memory near zero by
   * design (cache fills idle RAM) and reclaims it on demand — it evicts
   * file cache and compresses idle apps the moment the model asks for
   * pages. Instantaneous free memory therefore does not predict whether
   * the model loads; the honest failure signal is llama-server itself,
   * which startInstalledModel catches and explains.
   */
  private async warnIfMemoryTight(installed: InstalledModel): Promise<void> {
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
    if (compatibility.requiredMemoryBytes <= machine.availableMemoryBytes) {
      return;
    }
    void vscode.window.showWarningMessage(
      `Memory is tight: ${installed.displayName} wants about ${formatBytes(compatibility.requiredMemoryBytes)} and about ${formatBytes(machine.availableMemoryBytes)} looks free right now. macOS will make room, but other apps may slow down while it runs.`
    );
  }

  // Every status-bearing response carries the same cursor + storage envelope
  // alongside its own `type`/`runtime`/`installed` fields; this is the one
  // place that assembles it instead of five inline copies.
  private async responseEnvelope(
    runtime: ReturnType<LlamaServerManager["status"]>
  ): Promise<CursorSetupPayload & SetupStoragePayload & SetupModelOptionsPayload> {
    const cursorSetup = this.cursorSetupPayload(runtime);
    const storage = await this.storagePayload();
    return {
      cursorSetupViewModel: cursorSetup.viewModel,
      cursorSetupFreshness: cursorSetup.freshness,
      ...storage,
      ...await this.modelOptionsPayload(storage.downloadedModels)
    };
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

  private async modelOptionsPayload(downloadedModels: DownloadedModelEntry[]): Promise<SetupModelOptionsPayload> {
    const candidates = await this.modelOptionCandidateMap();
    const activeOption = this.slottedOptionId(downloadedModels.find((model) => model.active));
    const installedOption = this.slottedOptionId(downloadedModels.find((model) => model.installed));
    return {
      selectedModelOptionId: activeOption ?? installedOption ?? "max",
      modelOptions: this.localModelPack().map((option): SetupModelOptionView => {
        const slot = this.state.modelSlot(option.id);
        const downloadedId = slot ? this.downloadedModelIdForPath(slot.modelPath, downloadedModels) : undefined;
        const downloaded = downloadedId ? downloadedModels.find((model) => model.id === downloadedId && !model.partial) : undefined;
        const active = downloaded?.active === true;
        const candidate = candidates.get(option.id);
        const isDefaultRepo = option.repoId === LOCAL_MODEL_PACK.find((candidateOption) => candidateOption.id === option.id)?.repoId;
        const status = active
          ? "running"
          : downloaded
            ? "downloaded"
            : candidate instanceof Error
              ? "unavailable"
              : "available";
        const unavailableReason = candidate instanceof Error ? candidate.message : undefined;
        return {
          id: option.id,
          label: option.label,
          modelName: isDefaultRepo ? option.modelName : option.repoId,
          summary: isDefaultRepo ? option.summary : "Custom model",
          repoId: option.repoId,
          status,
          fileName: candidate instanceof Error ? downloaded?.fileName ?? slot?.fileName : candidate?.fileName ?? downloaded?.fileName ?? slot?.fileName,
          quantization: candidate instanceof Error ? undefined : candidate?.quantization,
          downloadSize: candidate instanceof Error ? slot?.sizeBytes ? formatBytes(slot.sizeBytes) : undefined : candidate?.sizeBytes ? formatBytes(candidate.sizeBytes) : undefined,
          requiredMemory: candidate instanceof Error ? undefined : candidate?.compatibility ? formatBytes(candidate.compatibility.requiredMemoryBytes) : undefined,
          downloadedModelId: downloaded?.id,
          statusText: active
            ? "Running"
            : downloaded
              ? "Ready"
              : unavailableReason ?? "Not installed"
        };
      })
    };
  }

  private slottedOptionId(model: DownloadedModelEntry | undefined): LocalModelOptionId | undefined {
    if (!model) {
      return undefined;
    }
    return this.localModelPack().find((option) => this.state.modelSlot(option.id)?.modelPath &&
      this.downloadedModelIdForPath(this.state.modelSlot(option.id)?.modelPath ?? "", [model]) === model.id)?.id;
  }

  private downloadedModelIdForPath(modelPath: string, downloadedModels: DownloadedModelEntry[]): string | undefined {
    const relative = path.relative(path.resolve(this.modelsRoot()), path.resolve(modelPath));
    return downloadedModels.find((model) => model.id === relative)?.id;
  }

  private async modelOptionCandidateMap(): Promise<Map<LocalModelOptionId, CandidateQuantization | Error>> {
    if (!this.modelOptionCandidates) {
      this.modelOptionCandidates = this.loadModelOptionCandidates();
    }
    const candidates = await this.modelOptionCandidates;
    // Never cache a failure. A transient Hugging Face hiccup at panel open
    // must not brand this Mac "incompatible" until the window reloads — the
    // next state request retries from scratch.
    if ([...candidates.values()].some((candidate) => candidate instanceof Error)) {
      this.modelOptionCandidates = undefined;
    }
    return candidates;
  }

  private async loadModelOptionCandidates(): Promise<Map<LocalModelOptionId, CandidateQuantization | Error>> {
    const entries = await Promise.all(this.localModelPack().map(async (option): Promise<[LocalModelOptionId, CandidateQuantization | Error]> => {
      try {
        const quantizations = await this.defaultQuantizations(option.repoId);
        if (quantizations.length === 0) {
          return [option.id, new Error("Hugging Face returned no model files — likely a network hiccup. Try again.")];
        }
        const candidate = selectBestCompatibleQuantization(quantizations);
        if (!candidate) {
          // All candidates were classified not-compatible; say why, using the
          // smallest one's blocking reason instead of a generic verdict.
          const reason = quantizations[0]?.compatibility.reasons[0];
          return [option.id, new Error(reason ?? "No compatible quantization found")];
        }
        if (!meetsAutomagicalQualityFloor(candidate.quantization)) {
          return [option.id, new Error(`Only ${candidate.quantization} fits, below the Q4 floor`)];
        }
        return [option.id, candidate];
      } catch (error) {
        return [option.id, error instanceof Error ? error : new Error(String(error))];
      }
    }));
    return new Map(entries);
  }

  private installedModelView(installed: InstalledModel): SetupInstalledModelView {
    return { displayName: installed.displayName };
  }

  private optionalInstalledModelView(installed: InstalledModel | undefined): SetupInstalledModelView | undefined {
    return installed ? this.installedModelView(installed) : undefined;
  }
}

/**
 * llama-server dying during startup is the honest out-of-memory signal (the
 * advisory in warnIfMemoryTight never blocks), so explain the likely cause
 * and the way out. Only genuine server failures get the hint — all
 * llamaHealth failure messages start with "llama-server"; cancellations and
 * resolver errors pass through untouched.
 */
function withMemoryHint(error: unknown, modelName: string): Error {
  const original = error instanceof Error ? error : new Error(String(error));
  if (!original.message.startsWith("llama-server")) {
    return original;
  }
  return new Error(
    `${modelName} failed to start. If this Mac is busy, it may not have room for the model right now — close some apps and try again, or run a smaller downloaded model from Storage. (${original.message})`
  );
}
