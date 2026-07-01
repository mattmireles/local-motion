import type { AutomagicalSetupCompletion, LastCopiedCursorSetup, RuntimeStatus } from "../types";

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
  const tunnelUrl = status.cursorTunnel?.url ? cursorTunnelBaseUrl(status.cursorTunnel.url) : "";
  const baseUrl = tunnelUrl;
  const apiKey = status.apiKey ?? "";
  const modelId = status.modelId ?? "";
  const isRunning = status.running && baseUrl.length > 0 && apiKey.length > 0 && modelId.length > 0;

  if (!isRunning) {
    const needsTunnel = status.running && !tunnelUrl;
    return {
      baseUrl,
      apiKey,
      modelId,
      isRunning: false,
      setupBlock: needsTunnel
        ? "Enable the Cursor tunnel or set a public tunnel URL before preparing Cursor."
        : "Start a local model in Local Motion before preparing Cursor.",
      steps: needsTunnel
        ? cursorTunnelSteps(status.cursorTunnel)
        : ["Start a local model in Local Motion.", "Return here to prepare Cursor with the active Base URL and model ID."],
      statusMessage: needsTunnel
        ? cursorTunnelStatusMessage(status.cursorTunnel)
        : status.message || "Start a local model before configuring Cursor."
    };
  }

  const setupBlock = [
    "Local Motion Cursor setup",
    `Model name: ${modelId}`,
    `OpenAI API Key: ${apiKey}`,
    `Override OpenAI Base URL: ${baseUrl}`
  ].join("\n");

  return {
    baseUrl,
    apiKey,
    modelId,
    isRunning: true,
    setupBlock,
    steps: [
    "Open Cursor Settings.",
    "Go to Models.",
    "Click Add Custom Model.",
    `Set Model name to ${modelId}.`,
    `Set API Key to ${apiKey}.`,
    `Set Base URL to ${baseUrl}.`,
    "Save it, then select Local Motion from Cursor's model picker."
    ],
    statusMessage: "Cursor does not expose a stable extension API for changing its native model picker. Click Add Custom Model in Cursor Settings > Models and use Model name, API key, and Base URL exactly as shown."
  };
}

function cursorTunnelBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function cursorTunnelSteps(tunnel: RuntimeStatus["cursorTunnel"]): string[] {
  if (tunnel?.error === "invalid-url") {
    return ["Set localMotion.cursorTunnelUrl to a public HTTPS tunnel URL.", "Localhost, private IPs, plain HTTP, and invalid URLs cannot be used with Cursor."];
  }
  if (tunnel?.error === "binary-missing") {
    return ["Install cloudflared with brew install cloudflared.", "Restart the local model, or set localMotion.cursorTunnelUrl to a public HTTPS tunnel."];
  }
  if (tunnel?.error === "start-timeout" || tunnel?.error === "dns-unresolved") {
    return ["The managed tunnel did not become reachable.", "Set localMotion.cursorTunnelUrl to a public HTTPS tunnel and restart the local model."];
  }
  if (tunnel?.error === "exited") {
    return ["The managed tunnel stopped.", "Restart the local model or set localMotion.cursorTunnelUrl to a public HTTPS tunnel."];
  }
  return ["Cursor's backend cannot reach localhost.", "Enable localMotion.cursorTunnel or set localMotion.cursorTunnelUrl, then restart the local model."];
}

function cursorTunnelStatusMessage(tunnel: RuntimeStatus["cursorTunnel"]): string {
  if (tunnel?.error === "invalid-url") {
    return "localMotion.cursorTunnelUrl must be a public HTTPS tunnel URL. Cursor's backend cannot reach localhost or private network URLs.";
  }
  if (tunnel?.error === "binary-missing") {
    return 'cloudflared is not installed. Install it with "brew install cloudflared" or set localMotion.cursorTunnelUrl.';
  }
  if (tunnel?.error === "start-timeout" || tunnel?.error === "dns-unresolved") {
    return "The managed Cursor tunnel did not become reachable. Set localMotion.cursorTunnelUrl to a public HTTPS tunnel.";
  }
  if (tunnel?.error === "exited") {
    return "The managed Cursor tunnel stopped. Restart the local model or set localMotion.cursorTunnelUrl.";
  }
  return "Cursor's backend cannot reach a localhost Base URL. Enable the Cursor tunnel or set localMotion.cursorTunnelUrl.";
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
    apiKeyLabel: "session-key",
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
