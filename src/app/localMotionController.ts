import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { cursorInstructions, cursorSetupResult } from "../cursor/cursorIntegration";
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
      cursorInstructions: cursorInstructions(runtime)
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
    return {
      type: "installed",
      installed,
      runtime,
      cursorInstructions: cursorInstructions(runtime)
    };
  }

  async stop(): Promise<Record<string, unknown>> {
    await this.runtime.stop();
    this.provider.refresh();
    const runtime = this.runtime.status();
    return { type: "runtime", runtime, cursorInstructions: cursorInstructions(runtime) };
  }

  cursorSetup(): Record<string, unknown> {
    const status = this.runtime.status();
    if (!status.running) {
      throw new Error("Start a local model before configuring Cursor.");
    }
    return { type: "cursorSetupResult", result: cursorSetupResult(status) };
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
}
