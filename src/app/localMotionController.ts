import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { cursorTunnelConfigFromWorkspace } from "./cursorTunnelConfig";
import type { CursorSetupValueKey } from "../cursor/cursorIntegration";
import { CursorSetupWorkflow } from "../cursor/cursorSetupWorkflow";
import { setupDiagnosticSummary, type SetupDiagnosticSummary } from "../diagnostics/setupDiagnostics";
import { chooseOptionCandidate, chooserQuantizations, fitContextTokens, fitRequiredMemoryBytes, MINIMUM_USABLE_CONTEXT_TOKENS, quantizationFromFileName } from "../models/compatibility";
import {
  DEFAULT_MODEL_REPO,
  LOCAL_MODEL_PACK,
  normalizeHuggingFaceRepoId,
  type LocalModelOptionId
} from "../models/defaultRepos";
import { deleteDownloadedModel, listDownloadedModels, resolveDownloadedModelId } from "../models/downloadedModels";
import { listQuantizations } from "../models/huggingFace";
import { canReuseInstalledModel, canReuseInstalledModelForDefault } from "../models/installedModel";
import { hasCompletedAutomagicalSetupForInstalledModel } from "../onboarding";
import { LocalMotionProvider } from "../provider/localMotionProvider";
import { downloadGguf, type DownloadProgress } from "../runtime/downloader";
import { contextTokensCap, LlamaServerManager } from "../runtime/llamaServer";
import { LlamaServerResolver } from "../runtime/llamaServerResolver";
import {
  SETUP_RESPONSE_TYPE,
  type AutomagicalSetupCompleteResponse,
  type CursorCopyResult,
  type CursorEndpointVerification,
  type CursorSetupPayload,
  type CursorSetupPreparedResponse,
  type SetupModelOptionsPayload,
  type SetupModelOptionView,
  type RuntimeResponse,
  type SetupInstalledModelView,
  type SetupQuantizationChoiceView,
  type SetupStoragePayload,
  type SetupStateResponse
} from "../setupProtocol";
import { allowLlamaInstallForAutomagicalStart } from "../setupPolicy";
import { LocalMotionState } from "../state";
import { isAppleSiliconHost, modelMemoryBudgetBytes, profileMachine } from "../system/machineProfile";
import { LOCAL_MOTION_MODEL_ID, type CandidateQuantization, type DownloadedModelEntry, type InstalledModel, type RuntimeSession } from "../types";
import { formatBytes, formatTokenWindow, modelDisplayName } from "../util/format";

/**
 * Facts a mutating operation decides by, minted ONCE at the lock boundary
 * by withSetupOperation and threaded down. Per-call-site captures were how
 * a pre-lock await (a Hugging Face listing, a resolver probe) kept slipping
 * in front of the epoch and reversing an explicit stop.
 */
interface SetupIntent {
  /** runtime.stopEpoch() at lock entry; a later bump means the user said stop. */
  stopEpoch: number;
  /** The quantization dropdown choices as they stood when the user acted. */
  quantizationChoice: ReadonlyMap<LocalModelOptionId, string>;
}

export class LocalMotionController {
  private readonly cursorSetup: CursorSetupWorkflow;
  private modelOptionCandidates: Promise<Map<LocalModelOptionId, CandidateQuantization[] | Error>> | undefined;
  // Session-scoped dropdown choices (fileName per option). Not persisted:
  // once installed, the downloaded file itself is the durable record.
  private readonly quantizationChoice = new Map<LocalModelOptionId, string>();
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

  async automagicalSetup(
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void = () => undefined,
    selectedModelOptionId: LocalModelOptionId = "max"
  ): Promise<AutomagicalSetupCompleteResponse | undefined> {
    return this.withSetupOperation(async (intent) => {
      const installedModel = await this.reusableInstalledModelForOption(selectedModelOptionId);
      if (!this.runtime.status().running || !this.isActiveInstalledModel(installedModel)) {
        if (installedModel) {
          await this.startInstalledModel(installedModel, {
            allowInstall: allowLlamaInstallForAutomagicalStart("explicit"),
            stopEpoch: intent.stopEpoch
          });
        } else {
          await this.installAndStartAll(await this.automagicalCandidates(intent.quantizationChoice), onProgress, onModelSelected, selectedModelOptionId, intent.stopEpoch);
        }
      }

      return this.completeAutomagicalSetup();
    });
  }

  async resumeAutomagicalRuntime(): Promise<RuntimeResponse | undefined> {
    // Startup resume is opportunistic: if an explicit setup is already
    // running it yields silently instead of racing the start or surfacing
    // a spurious "already running" error at window load.
    if (this.setupOperation) {
      return undefined;
    }
    return this.withSetupOperation(async (intent) => {
      if (!this.runtime.status().running) {
        const installedModel = await this.reusableInstalledModel({ requireCurrentDefault: true });
        if (!installedModel) {
          return undefined;
        }
        await this.startInstalledModel(installedModel, {
          allowInstall: allowLlamaInstallForAutomagicalStart("startupResume"),
          stopEpoch: intent.stopEpoch
        });
      }

      const runtime = this.runtime.status();
      return { type: SETUP_RESPONSE_TYPE.RUNTIME, runtime, ...await this.responseEnvelope(runtime) };
    });
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

  // Turn Off is an interrupt, deliberately outside withSetupOperation (see
  // the lock's contract). runtime.stop() aborts any in-flight start and
  // awaits the runtime's own start queue, so it cannot corrupt a setup.
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
    return this.withSetupOperation(async (intent) => this.replaceModelOptionLocked(optionId, repoId, intent.stopEpoch, onProgress, onModelSelected));
  }

  private async replaceModelOptionLocked(
    optionId: LocalModelOptionId,
    repoId: string,
    stopEpoch: number,
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void = () => undefined
  ): Promise<SetupStateResponse> {
    const option = LOCAL_MODEL_PACK.find((candidate) => candidate.id === optionId);
    const normalizedRepo = normalizeHuggingFaceRepoId(repoId);
    if (!option || !normalizedRepo.includes("/")) {
      throw new Error("Paste a Hugging Face GGUF repository like owner/model-GGUF.");
    }

    // Intent at click plus an intact stop epoch (minted at lock entry)
    // decide the restart: a user replacing the ACTIVE model wants the
    // replacement running even if the old server crashes mid-download,
    // while an explicit Turn Off at ANY point after the click bumps the
    // epoch and wins.
    const previous = this.state.modelSlot(optionId);
    const previousActive = Boolean(previous && this.isActiveInstalledModel(previous));

    // Same decision logic as the pack options: automagical best, gated by
    // the Q4 quality floor, with the honest blocking reason on failure.
    const candidate = chooseOptionCandidate(await this.defaultQuantizations(normalizedRepo), undefined);
    if (candidate instanceof Error) {
      throw new Error(`${normalizedRepo}: ${candidate.message}`);
    }

    const installed = await this.installCandidate(candidate, onProgress, onModelSelected);

    await vscode.workspace.getConfiguration("localMotion").update(option.settingKey, normalizedRepo, vscode.ConfigurationTarget.Global);
    this.modelOptionCandidates = undefined;
    await this.state.setModelSlot(optionId, installed);

    if (previousActive && this.runtime.stopEpoch() === stopEpoch) {
      await this.startInstalledModel(installed, {
        allowInstall: allowLlamaInstallForAutomagicalStart("explicit"),
        stopEpoch
      });
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
    return this.withSetupOperation(async (intent) => this.startDownloadedModelLocked(id, intent.stopEpoch));
  }

  private async startDownloadedModelLocked(id: string, stopEpoch: number): Promise<SetupStateResponse> {
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
      modelId: LOCAL_MOTION_MODEL_ID
    } : {
      // The storage id is <safeId(repoId-revision)>/<fileName>; the folder
      // name is the best surviving record of the source repo and is only
      // used for display fallbacks.
      repoId: path.dirname(id),
      fileName: model.fileName,
      sizeBytes: model.sizeBytes,
      modelPath,
      modelId: LOCAL_MOTION_MODEL_ID,
      displayName: model.fileName.replace(/\.gguf$/i, ""),
      // Provisional: the runtime fits the real context at spawn and
      // startInstalledModel persists what actually ran.
      contextTokens: MINIMUM_USABLE_CONTEXT_TOKENS
    };

    await this.startInstalledModel(installed, {
      allowInstall: allowLlamaInstallForAutomagicalStart("explicit"),
      stopEpoch
    });
    return this.initialState();
  }

  async deleteDownloadedModel(id: string): Promise<SetupStateResponse | undefined> {
    // Fail fast before the modal, but confirm OUTSIDE the lock — a user
    // pondering a modal must never hold up an install. The mutation then
    // takes the lock and re-derives every fact it acts on.
    if (this.setupOperation) {
      throw new Error("Local Motion setup is already running. Wait for the current setup to finish.");
    }
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

    return this.withSetupOperation(async () => {
      // Re-read inside the lock: the modal wait is unbounded, and activity
      // can change while it sits open (a switch or stop that landed
      // mid-modal). The pre-modal snapshot only made the confirmation copy.
      const current = (await this.downloadedModels()).models.find((candidate) => candidate.id === id);
      if (!current) {
        return this.initialState();
      }
      // Every start path holds this lock (the provider serves only running
      // sessions), so holding it here guarantees no start is in flight —
      // a fresh "not active" really means the file is safe to unlink.
      if (current.active) {
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
    });
  }

  async connectCursor(): Promise<CursorSetupPreparedResponse> {
    // Serialized with installs/switches: a Connect fired from the command
    // palette mid-install would otherwise interleave a stop() with another
    // operation's start.
    return this.withSetupOperation(async (intent) => {
      // Pre-flight config validation, not tunnel-state inspection: an
      // invalid localMotion.cursorTunnelUrl is a settings error no respawn
      // can fix — erroring here keeps a healthy model running instead of
      // paying a multi-GB reload to surface "invalid-url".
      if (cursorTunnelConfigFromWorkspace({ forceCursor: true }).manualUrlInvalid) {
        throw new Error("localMotion.cursorTunnelUrl is not a valid HTTPS URL. Fix or clear the setting, then run Connect Cursor again.");
      }
      const active = this.runtime.activeSession();
      if (active) {
        // The runtime is the single tunnel authority: its reuse check
        // returns the session untouched when the demanded tunnel is already
        // live, and respawns (inside its own serialized start, so a Turn
        // Off cancels rather than being reversed) when the tunnel is
        // missing, dead, invalid, or no longer the configured manual URL.
        // Deciding "does this need healing" here as well was how a leftover
        // quick-tunnel URL masked a newly configured manual one.
        await this.startInstalledModel(active, {
          allowInstall: allowLlamaInstallForAutomagicalStart("explicit"),
          connectCursor: true,
          stopEpoch: intent.stopEpoch
        });
      }

      return this.prepareCursorAfterStartingInstalledModel(intent.stopEpoch);
    });
  }

  // Private on purpose: called only inside connectCursor's setup-operation
  // lock. A public entry here would start a model outside that serialization.
  private async prepareCursorAfterStartingInstalledModel(stopEpoch: number): Promise<CursorSetupPreparedResponse> {
    if (!this.runtime.status().running) {
      const installedModel = await this.reusableInstalledModel();
      if (installedModel) {
        await this.startInstalledModel(installedModel, {
          allowInstall: allowLlamaInstallForAutomagicalStart("explicit"),
          connectCursor: true,
          stopEpoch
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

  private defaultRepo(): string {
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
    return listQuantizations(repoId, machine, contextTokensCap());
  }

  private async automagicalCandidates(chosen: ReadonlyMap<LocalModelOptionId, string>): Promise<CandidateQuantization[]> {
    // `chosen` is the lock-entry snapshot: selectQuantization is
    // deliberately unlocked, so a choice posted from another setup surface
    // mid-listing must not retarget a download already started.
    const attempts: string[] = [];
    const selected: CandidateQuantization[] = [];
    const candidates = await this.modelOptionCandidateMap();
    for (const option of this.localModelPack()) {
      const candidate = this.optionCandidate(option.id, candidates.get(option.id), chosen);
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

  private async installAndStartAll(
    candidates: CandidateQuantization[],
    onProgress: (progress: DownloadProgress, modelName?: string) => void,
    onModelSelected: (modelName: string, requiredMemory: string, availableMemory: string) => void,
    selectedModelOptionId: LocalModelOptionId,
    stopEpoch: number
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
    // The stop epoch — not a running snapshot — carries intent across the
    // downloads: an explicit Turn Off / Free Memory bumps it and cancels
    // this start; an old-model crash does not, so a crash cannot silently
    // cancel the switch the user asked for.
    if (this.runtime.stopEpoch() === stopEpoch) {
      await this.startInstalledModel(installed, {
        allowInstall: allowLlamaInstallForAutomagicalStart("explicit"),
        stopEpoch
      });
    }
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
    // until the model is actually loaded. The honest memory gate is llama-server
    // itself at load time (caught and explained by withMemoryHint) — so a tight
    // machine still gets the (already-downloaded) model and only has to close
    // apps and turn it on again, with no second download.
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
      contextTokens: candidate.compatibility.fittedContextTokens
    };
  }

  private async startInstalledModel(
    installed: InstalledModel,
    options: { allowInstall: boolean; connectCursor?: boolean; stopEpoch?: number }
  ): Promise<RuntimeSession> {
    // Intent is enforced at the start boundary: the epoch captured at the
    // caller's decision (or here, when the decision is this call) rides
    // into runtime.start(). The resolver goes along as a thunk — the
    // runtime invokes it only after its reuse check fails, so a healthy
    // reconnect never pays a PATH probe or brew install, and a Turn Off
    // during resolution aborts the start instead of being reversed.
    const stopEpoch = options.stopEpoch ?? this.runtime.stopEpoch();
    const tunnelConfig = options.connectCursor ? cursorTunnelConfigFromWorkspace({ forceCursor: true }) : undefined;
    const reusedSession = this.runtime.activeSession();
    const session = await this.runtime.start(
      installed,
      () => this.resolver.resolve({ allowInstall: options.allowInstall }),
      undefined,
      tunnelConfig,
      stopEpoch
    ).catch((error: unknown) => {
      throw withMemoryHint(error, installed.displayName);
    });
    if (session === reusedSession) {
      // The runtime reused the running session untouched (same model, tunnel
      // satisfied) — nothing changed, so nothing re-persists and no
      // "is running" toast repeats on an already-connected reconnect.
      return session;
    }
    // Persist exactly what runs. The runtime owns the context fit (the -c it
    // spawned is in session.contextTokens); explicit picks keep session-only
    // fields like the bearer key out of globalState.
    await this.state.setInstalledModel({
      repoId: session.repoId,
      fileName: session.fileName,
      revision: session.revision,
      sizeBytes: session.sizeBytes,
      modelPath: session.modelPath,
      modelId: LOCAL_MOTION_MODEL_ID,
      displayName: session.displayName,
      contextTokens: session.contextTokens
    });
    this.provider.refresh();
    // Fire-and-forget: a button-less toast's promise settles only when the
    // user explicitly dismisses it — once it fades into the notification
    // bell it stays pending forever. Awaiting it here held both setup locks
    // after a successful start and froze model switching (2026-07-02).
    void vscode.window.showInformationMessage(`${session.displayName} is running locally.`);
    return session;
  }

  private isActiveInstalledModel(installed: InstalledModel | undefined): boolean {
    const active = this.runtime.activeSession();
    return Boolean(installed && active && path.resolve(installed.modelPath) === path.resolve(active.modelPath));
  }

  /**
   * The single serialization authority for mutating operations. Everything
   * that installs, deletes, or starts a model takes this lock — the LM
   * provider serves only already-running sessions and never starts one —
   * and re-entry throws rather than queues so the user always gets an
   * immediate, honest "already running". Deliberate exceptions:
   * - stop() is an INTERRUPT, never locked — gating Turn Off on setup state
   *   is what once made it a dead button. It is safe lock-free because the
   *   runtime serializes internally: stop() bumps the session generation,
   *   aborts any in-flight start, and awaits the start queue.
   * - selectQuantization() writes a session-scoped preference map; a running
   *   install already captured its candidates, so there is nothing to race.
   * - Reads (initialState, diagnose) never lock.
   * Nothing awaited under this lock may pend on user inaction — a
   * button-less toast await once wedged it permanently (2026-07-02).
   * Mid-operation user intent is read through runtime.stopEpoch(): an
   * explicit stop bumps it, a crash does not. Capture the epoch at
   * operation start and compare before a final start — a bare "is it
   * running" snapshot cannot tell a Turn Off from a crash.
   */
  /** Host truth for the webview's busy rendering: is the lock held NOW? */
  setupBusy(): boolean {
    return this.setupOperation !== undefined;
  }

  private async withSetupOperation<T>(operation: (intent: SetupIntent) => Promise<T>): Promise<T> {
    if (this.setupOperation) {
      throw new Error("Local Motion setup is already running. Wait for the current setup to finish.");
    }
    const intent: SetupIntent = {
      stopEpoch: this.runtime.stopEpoch(),
      quantizationChoice: new Map(this.quantizationChoice)
    };
    const running = operation(intent);
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
    const activeOption = this.slottedOptionId(downloadedModels.find((model) => model.active));
    const installedOption = this.slottedOptionId(downloadedModels.find((model) => model.installed));
    const optionStates = this.localModelPack().map((option) => {
      const slot = this.state.modelSlot(option.id);
      const downloadedId = slot ? this.downloadedModelIdForPath(slot.modelPath, downloadedModels) : undefined;
      const downloaded = downloadedId ? downloadedModels.find((model) => model.id === downloadedId && !model.partial) : undefined;
      return { option, slot, downloaded };
    });
    // Disk facts need no network. When every slot is already downloaded the
    // panel renders instantly and offline; the live Hugging Face listing is
    // consulted only for options that still need a download.
    const candidates = optionStates.every((state) => state.downloaded)
      ? new Map<LocalModelOptionId, CandidateQuantization[] | Error>()
      : await this.modelOptionCandidateMap();
    return {
      selectedModelOptionId: activeOption ?? installedOption ?? "max",
      modelOptions: optionStates.map(({ option, slot, downloaded }): SetupModelOptionView => {
        const active = downloaded?.active === true;
        const isDefaultRepo = option.repoId === LOCAL_MODEL_PACK.find((candidateOption) => candidateOption.id === option.id)?.repoId;
        // Once a file is on disk, the card reports THAT file — its name,
        // its quantization, its size, the window the runtime would fit for
        // it — never the live listing's best candidate. A downloaded Q4
        // must not masquerade as "Q8 · 128k" because Hugging Face answered.
        if (downloaded) {
          return {
            id: option.id,
            label: option.label,
            modelName: isDefaultRepo ? option.modelName : option.repoId,
            repoId: option.repoId,
            status: active ? "running" : "downloaded",
            fileName: downloaded.fileName,
            quantization: quantizationFromFileName(downloaded.fileName),
            downloadSize: formatBytes(downloaded.sizeBytes),
            ...this.diskFit(downloaded.sizeBytes),
            downloadedModelId: downloaded.id,
            statusText: active ? "Running" : "Ready"
          };
        }
        const quantizations = candidates.get(option.id);
        const candidate = this.optionCandidate(option.id, quantizations);
        const status = candidate instanceof Error ? "unavailable" : "available";
        const unavailableReason = candidate instanceof Error ? candidate.message : undefined;
        return {
          id: option.id,
          label: option.label,
          modelName: isDefaultRepo ? option.modelName : option.repoId,
          repoId: option.repoId,
          status,
          fileName: candidate instanceof Error ? slot?.fileName : candidate?.fileName ?? slot?.fileName,
          quantization: candidate instanceof Error ? undefined : candidate?.quantization,
          downloadSize: candidate instanceof Error ? slot?.sizeBytes ? formatBytes(slot.sizeBytes) : undefined : candidate?.sizeBytes ? formatBytes(candidate.sizeBytes) : undefined,
          requiredMemory: candidate instanceof Error ? undefined : candidate?.compatibility ? formatBytes(candidate.compatibility.requiredMemoryBytes) : undefined,
          contextWindow: !(candidate instanceof Error) && candidate?.compatibility
            ? formatTokenWindow(candidate.compatibility.fittedContextTokens)
            : undefined,
          quantizationChoices: quantizations && !(quantizations instanceof Error)
            ? this.quantizationChoiceViews(quantizations)
            : undefined,
          statusText: unavailableReason ?? ""
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

  private async modelOptionCandidateMap(): Promise<Map<LocalModelOptionId, CandidateQuantization[] | Error>> {
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

  private async loadModelOptionCandidates(): Promise<Map<LocalModelOptionId, CandidateQuantization[] | Error>> {
    const entries = await Promise.all(this.localModelPack().map(async (option): Promise<[LocalModelOptionId, CandidateQuantization[] | Error]> => {
      try {
        const quantizations = await this.defaultQuantizations(option.repoId);
        if (quantizations.length === 0) {
          return [option.id, new Error("Hugging Face returned no model files — likely a network hiccup. Try again.")];
        }
        return [option.id, quantizations];
      } catch (error) {
        return [option.id, error instanceof Error ? error : new Error(String(error))];
      }
    }));
    return new Map(entries);
  }

  /**
   * The candidate an option would install. The decision logic is pure and
   * behaviorally tested in compatibility.ts; this only threads the stored
   * choice through.
   */
  private optionCandidate(
    optionId: LocalModelOptionId,
    quantizations: CandidateQuantization[] | Error | undefined,
    chosen: ReadonlyMap<LocalModelOptionId, string> = this.quantizationChoice
  ): CandidateQuantization | Error | undefined {
    if (!quantizations || quantizations instanceof Error) {
      return quantizations;
    }
    return chooseOptionCandidate(quantizations, chosen.get(optionId));
  }

  /**
   * The chooser's entries, labeled with the consequences a user plans
   * around. Eligibility and dedupe live in chooserQuantizations — sub-Q4
   * crush jobs and unparseable files stay in Advanced; a chooser should
   * offer the ladder the product stands behind, not the whole warehouse.
   */
  private quantizationChoiceViews(quantizations: CandidateQuantization[]): SetupQuantizationChoiceView[] {
    const choices = chooserQuantizations(quantizations);
    // Context joins the label only when the levels actually trade it away;
    // when every level fits the same window, repeating it per entry is noise.
    const contextVaries = new Set(choices.map((candidate) => candidate.compatibility.fittedContextTokens)).size > 1;
    return choices.map((candidate) => ({
      fileName: candidate.fileName,
      quantization: candidate.quantization,
      label: `${candidate.quantization} · ${formatBytes(candidate.sizeBytes)} download` +
        (contextVaries ? ` · ${formatTokenWindow(candidate.compatibility.fittedContextTokens)} context` : "")
    }));
  }

  async selectQuantization(optionId: LocalModelOptionId, fileName: string): Promise<SetupStateResponse> {
    const quantizations = (await this.modelOptionCandidateMap()).get(optionId);
    // Only entries the chooser actually offers are selectable — a crafted
    // webview message cannot reach a hidden sub-Q4 or unparseable file, and
    // an incompatible pick is rejected loudly instead of ignored.
    if (
      quantizations instanceof Error ||
      !quantizations ||
      !chooserQuantizations(quantizations).some((candidate) => candidate.fileName === fileName)
    ) {
      throw new Error("That quantization is not available for this model.");
    }
    this.quantizationChoice.set(optionId, fileName);
    return this.initialState();
  }

  /**
   * Display-only: the context window and runtime memory this Mac gets for a
   * file already on disk, from the same formulas the spawn uses so the card
   * and the server agree. Never feeds a start — startInstalledModel persists
   * what the runtime actually spawned.
   */
  private diskFit(sizeBytes: number): Pick<SetupModelOptionView, "contextWindow" | "requiredMemory"> {
    const fitted = fitContextTokens(sizeBytes, modelMemoryBudgetBytes(), isAppleSiliconHost(), contextTokensCap());
    if (fitted <= 0) {
      return {};
    }
    return {
      contextWindow: formatTokenWindow(fitted),
      requiredMemory: formatBytes(fitRequiredMemoryBytes(sizeBytes, isAppleSiliconHost(), fitted))
    };
  }

  private installedModelView(installed: InstalledModel): SetupInstalledModelView {
    return { displayName: installed.displayName };
  }

  private optionalInstalledModelView(installed: InstalledModel | undefined): SetupInstalledModelView | undefined {
    return installed ? this.installedModelView(installed) : undefined;
  }
}

/**
 * llama-server dying during startup is the honest out-of-memory signal —
 * nothing upstream blocks on instantaneous free RAM, macOS makes room on
 * demand — so explain the likely cause and the way out. Only genuine server
 * failures get the hint: all llamaHealth failure messages start with
 * "llama-server"; cancellations and resolver errors pass through untouched.
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
