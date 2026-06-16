import type { RuntimeStatus } from "../types";
import { LOCAL_MOTION_API_KEY } from "../runtime/openAiChat";

export interface CursorSetupResult {
  applied: false;
  message: string;
  instructions: string[];
}

export function cursorInstructions(status: RuntimeStatus): string[] {
  const baseUrl = status.baseUrl ?? "http://127.0.0.1:<port>/v1";
  const modelId = status.modelId ?? "local-motion-model";
  return [
    "Open Cursor Settings.",
    "Go to Models.",
    "Add or enable an OpenAI-compatible model.",
    `Set Base URL to ${baseUrl}.`,
    `Set API Key to ${LOCAL_MOTION_API_KEY}.`,
    `Set Model ID to ${modelId}.`,
    "Select the model from Cursor's model picker."
  ];
}

export function cursorSetupResult(status: RuntimeStatus): CursorSetupResult {
  return {
    applied: false,
    message: "Cursor does not expose a stable extension API for changing its native model picker. Use these settings.",
    instructions: cursorInstructions(status)
  };
}
