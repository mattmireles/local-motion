import type { AutomagicalSetupCompletion, LastCopiedCursorSetup, RuntimeStatus } from "../types";
import { LOCAL_MOTION_API_KEY } from "../runtime/openAiChat";

export interface CursorSetupViewModel {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  isRunning: boolean;
  setupBlock: string;
  steps: string[];
  statusMessage: string;
}

export type CursorSetupValueKey = "apiKey" | "baseUrl" | "modelId" | "setupBlock";

export interface CursorSetupFreshness {
  status: "not-copied" | "copied" | "current" | "stale";
  message: string;
  lastCopied?: LastCopiedCursorSetup;
}

export interface AutomagicalCompletionSignals {
  endpointVerified: boolean;
  setupCopied: boolean;
  settingsOpened: boolean;
}

export function isCursorSetupValueKey(value: unknown): value is CursorSetupValueKey {
  return value === "apiKey" || value === "baseUrl" || value === "modelId" || value === "setupBlock";
}

export function cursorSetupViewModel(status: RuntimeStatus): CursorSetupViewModel {
  const baseUrl = status.baseUrl ?? "";
  const modelId = status.modelId ?? "";
  const isRunning = status.running && baseUrl.length > 0 && modelId.length > 0;

  if (!isRunning) {
    return {
      baseUrl,
      apiKey: LOCAL_MOTION_API_KEY,
      modelId,
      isRunning: false,
      setupBlock: "Start a local model in Local Motion before preparing Cursor.",
      steps: ["Start a local model in Local Motion.", "Return here to prepare Cursor with the active Base URL and model ID."],
      statusMessage: status.message || "Start a local model before configuring Cursor."
    };
  }

  const setupBlock = [
    "Local Motion Cursor setup",
    `OpenAI API Key: ${LOCAL_MOTION_API_KEY}`,
    `Override OpenAI Base URL: ${baseUrl}`,
    `Custom Model / Model Name: ${modelId}`
  ].join("\n");

  return {
    baseUrl,
    apiKey: LOCAL_MOTION_API_KEY,
    modelId,
    isRunning: true,
    setupBlock,
    steps: [
    "Open Cursor Settings.",
    "Go to Models.",
    "Add or enable an OpenAI-compatible model.",
    `Set Base URL to ${baseUrl}.`,
    `Set API Key to ${LOCAL_MOTION_API_KEY}.`,
    `Set Model ID to ${modelId}.`,
    "Select the model from Cursor's model picker."
    ],
    statusMessage: "Cursor does not expose a stable extension API for changing its native model picker. Use these settings."
  };
}

export function cursorSetupValue(viewModel: CursorSetupViewModel, key: CursorSetupValueKey): string {
  switch (key) {
    case "apiKey":
      return viewModel.apiKey;
    case "baseUrl":
      return viewModel.baseUrl;
    case "modelId":
      return viewModel.modelId;
    case "setupBlock":
      return viewModel.setupBlock;
  }
  throw new Error("Unknown Cursor setup value.");
}

export function shouldPersistCursorSetupCopy(key: CursorSetupValueKey, ok: boolean): boolean {
  return ok && key === "setupBlock";
}

export function shouldMarkAutomagicalSetupCompleted(signals: AutomagicalCompletionSignals): boolean {
  return signals.endpointVerified && signals.setupCopied && signals.settingsOpened;
}

export function lastCopiedCursorSetup(
  viewModel: CursorSetupViewModel,
  trigger: LastCopiedCursorSetup["trigger"],
  copiedAt: string,
  endpointVerifiedAt?: string
): LastCopiedCursorSetup {
  return {
    baseUrl: viewModel.baseUrl,
    modelId: viewModel.modelId,
    apiKeyLabel: "local-motion",
    copiedAt,
    trigger,
    endpointVerifiedAt
  };
}

export function automagicalSetupCompletion(
  setup: LastCopiedCursorSetup,
  completedAt: string
): AutomagicalSetupCompletion {
  if (!setup.endpointVerifiedAt) {
    throw new Error("Automagical setup completion requires verified Cursor setup.");
  }

  return {
    baseUrl: setup.baseUrl,
    modelId: setup.modelId,
    apiKeyLabel: setup.apiKeyLabel,
    cursorSetupCopiedAt: setup.copiedAt,
    endpointVerifiedAt: setup.endpointVerifiedAt,
    completedAt
  };
}

export function cursorSetupFreshness(
  viewModel: CursorSetupViewModel,
  lastCopied: LastCopiedCursorSetup | undefined
): CursorSetupFreshness {
  if (!lastCopied) {
    return {
      status: "not-copied",
      message: "Cursor setup values have not been copied for this Local Motion session."
    };
  }

  if (!viewModel.isRunning) {
    return {
      status: "stale",
      message: `Cursor setup values were last copied for ${lastCopied.modelId} at ${lastCopied.baseUrl}, but no Local Motion model is running.`,
      lastCopied
    };
  }

  if (lastCopied.baseUrl !== viewModel.baseUrl || lastCopied.modelId !== viewModel.modelId) {
    return {
      status: "stale",
      message: `Cursor setup values may be stale. Last copied ${lastCopied.modelId} at ${lastCopied.baseUrl}; current setup is ${viewModel.modelId} at ${viewModel.baseUrl}.`,
      lastCopied
    };
  }

  if (!lastCopied.endpointVerifiedAt) {
    return {
      status: "copied",
      message: `Cursor setup values were copied for ${viewModel.modelId} at ${viewModel.baseUrl}, but the endpoint was not verified during that copy.`,
      lastCopied
    };
  }

  return {
    status: "current",
    message: `Cursor setup values were verified for ${viewModel.modelId} at ${viewModel.baseUrl}.`,
    lastCopied
  };
}
