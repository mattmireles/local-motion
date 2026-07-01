import {
  automagicalSetupCompletion,
  cursorSetupFreshness,
  cursorSetupValue,
  cursorSetupViewModel,
  lastCopiedCursorSetup,
  shouldMarkAutomagicalSetupCompleted,
  shouldPersistCursorSetupCopy,
  type CursorSetupFreshness,
  type CursorSetupValueKey,
  type CursorSetupViewModel
} from "./cursorIntegration";
import {
  SETUP_RESPONSE_TYPE,
  type CursorActionResult,
  type CursorCopyResult,
  type CursorEndpointVerification,
  type CursorSettingsOpened,
  type CursorSetupPayload,
  type CursorSetupPreparedResponse
} from "../setupProtocol";
import type { AutomagicalSetupCompletion, LastCopiedCursorSetup, RuntimeStatus } from "../types";

const CURSOR_ENDPOINT_VERIFY_TIMEOUT_MS = 5_000;

export interface CursorSetupHost {
  writeClipboardText(value: string): Promise<void>;
  openSettings(query: string): Promise<void>;
  fetch(input: string, init?: RequestInit): Promise<Response>;
  now(): string;
}

export interface CursorSetupStore {
  lastCopiedCursorSetup(): LastCopiedCursorSetup | undefined;
  setLastCopiedCursorSetup(setup: LastCopiedCursorSetup): Promise<void>;
  markAutomagicalSetupCompleted(completion: AutomagicalSetupCompletion): Promise<void>;
}

export class CursorSetupWorkflow {
  constructor(
    private readonly state: CursorSetupStore,
    private readonly runtimeStatus: () => RuntimeStatus,
    private readonly host: CursorSetupHost,
    private readonly endpointVerifyTimeoutMs = CURSOR_ENDPOINT_VERIFY_TIMEOUT_MS
  ) {}

  payload(runtime: RuntimeStatus): CursorSetupPayload {
    const viewModel = cursorSetupViewModel(runtime);
    return {
      cursorSetupViewModel: viewModel,
      cursorSetupFreshness: this.freshness(viewModel)
    };
  }

  async prepareCursor(): Promise<CursorSetupPreparedResponse> {
    const viewModel = this.currentViewModel();
    const verification = await this.verifyViewModelEndpoint(viewModel);
    if (!verification.ok) {
      return {
        type: SETUP_RESPONSE_TYPE.CURSOR_SETUP_PREPARED,
        viewModel,
        cursorSetupFreshness: this.freshness(viewModel),
        verification,
        copy: { ok: false, message: "Setup block was not copied because endpoint verification failed." },
        settings: {
          type: SETUP_RESPONSE_TYPE.CURSOR_SETTINGS_OPENED,
          ok: false,
          message: "Cursor settings were not opened because endpoint verification failed."
        }
      };
    }

    const copy = await this.writeCursorValue("setupBlock", viewModel);
    let freshness = this.freshness(viewModel);
    if (copy.ok) {
      const copiedAt = this.host.now();
      await this.state.setLastCopiedCursorSetup(lastCopiedCursorSetup(viewModel, "prepareCursor", copiedAt, copiedAt));
      freshness = this.freshness(viewModel);
    }

    const settings = await this.openCursorSettings();
    return { type: SETUP_RESPONSE_TYPE.CURSOR_SETUP_PREPARED, viewModel, cursorSetupFreshness: freshness, verification, copy, settings };
  }

  async prepareCursorAndMarkCompleted(): Promise<CursorSetupPreparedResponse> {
    const cursor = await this.prepareCursor();
    if (shouldMarkAutomagicalSetupCompleted({
      endpointVerified: cursor.verification.ok,
      setupCopied: cursor.copy.ok,
      settingsOpened: cursor.settings.ok
    }) && cursor.cursorSetupFreshness.lastCopied) {
      await this.state.markAutomagicalSetupCompleted(
        automagicalSetupCompletion(cursor.cursorSetupFreshness.lastCopied, this.host.now())
      );
    }

    return cursor;
  }

  async copyCursorValue(key: CursorSetupValueKey): Promise<CursorCopyResult> {
    const viewModel = this.currentViewModel();
    const result = await this.writeCursorValue(key, viewModel);
    let freshness = this.freshness(viewModel);
    if (shouldPersistCursorSetupCopy(key, result.ok)) {
      await this.state.setLastCopiedCursorSetup(lastCopiedCursorSetup(viewModel, "copySetupBlock", this.host.now()));
      freshness = this.freshness(viewModel);
    }
    return { type: SETUP_RESPONSE_TYPE.CURSOR_COPY_RESULT, key, cursorSetupFreshness: freshness, ...result };
  }

  async verifyCursorEndpoint(): Promise<CursorEndpointVerification> {
    return this.verifyViewModelEndpoint(this.currentViewModel());
  }

  async openCursorSettings(): Promise<CursorSettingsOpened> {
    if (!this.currentViewModel().isRunning) {
      return { type: SETUP_RESPONSE_TYPE.CURSOR_SETTINGS_OPENED, ok: false, message: "Start a local model before opening Cursor Models settings." };
    }
    try {
      await this.host.openSettings("Cursor Models");
      return { type: SETUP_RESPONSE_TYPE.CURSOR_SETTINGS_OPENED, ok: true, message: "Opened Cursor Settings. Click Add Custom Model under Models." };
    } catch (error) {
      return {
        type: SETUP_RESPONSE_TYPE.CURSOR_SETTINGS_OPENED,
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private currentViewModel(): CursorSetupViewModel {
    return cursorSetupViewModel(this.runtimeStatus());
  }

  private freshness(viewModel: CursorSetupViewModel): CursorSetupFreshness {
    return cursorSetupFreshness(viewModel, this.state.lastCopiedCursorSetup());
  }

  private async writeCursorValue(key: CursorSetupValueKey, viewModel: CursorSetupViewModel): Promise<CursorActionResult> {
    if (!viewModel.isRunning) {
      return { ok: false, message: "Start a local model before copying Cursor setup values." };
    }
    try {
      await this.host.writeClipboardText(cursorSetupValue(viewModel, key));
      return { ok: true, message: copyMessage(key) };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async verifyViewModelEndpoint(viewModel: CursorSetupViewModel): Promise<CursorEndpointVerification> {
    if (!viewModel.isRunning) {
      return { type: SETUP_RESPONSE_TYPE.CURSOR_ENDPOINT_VERIFICATION, ok: false, message: "Start a local model before verifying Cursor setup." };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.endpointVerifyTimeoutMs);
    try {
      const response = await this.host.fetch(`${viewModel.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${viewModel.apiKey}` },
        signal: controller.signal
      });
      if (!response.ok) {
        return {
          type: SETUP_RESPONSE_TYPE.CURSOR_ENDPOINT_VERIFICATION,
          ok: false,
          message: `Local Motion endpoint returned HTTP ${response.status}. Copy the current session API key and verify the model is still running.`
        };
      }

      const payload = await response.json() as { data?: Array<{ id?: unknown }> };
      const modelIds = Array.isArray(payload.data)
        ? payload.data.map((model) => model.id).filter((id): id is string => typeof id === "string")
        : [];
      if (!modelIds.includes(viewModel.modelId)) {
        return {
          type: SETUP_RESPONSE_TYPE.CURSOR_ENDPOINT_VERIFICATION,
          ok: false,
          message: `Local Motion endpoint is running, but model "${viewModel.modelId}" was not listed.`
        };
      }

      return {
        type: SETUP_RESPONSE_TYPE.CURSOR_ENDPOINT_VERIFICATION,
        ok: true,
        message: `Verified ${viewModel.modelId} at ${viewModel.baseUrl}.`
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          type: SETUP_RESPONSE_TYPE.CURSOR_ENDPOINT_VERIFICATION,
          ok: false,
          message: "Local Motion endpoint did not respond within 5 seconds."
        };
      }
      return {
        type: SETUP_RESPONSE_TYPE.CURSOR_ENDPOINT_VERIFICATION,
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
      return "Copied Cursor connection details.";
  }
}
