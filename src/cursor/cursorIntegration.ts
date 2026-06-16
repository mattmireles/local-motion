import type { RuntimeStatus } from "../types";
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
}
