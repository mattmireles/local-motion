import { createHash } from "node:crypto";
import type { AutomagicalSetupCompletion, LastCopiedCursorSetup, RuntimeStatus } from "../types";

export interface CursorSetupViewModel {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  /** True when Cursor can be configured (local agent + public tunnel + key + model). */
  isRunning: boolean;
  /** True when local compute is up, even if the Cursor tunnel is not. */
  localAgentRunning: boolean;
  setupBlock: string;
  steps: string[];
  statusMessage: string;
}

export type CursorSetupValueKey = "apiKey" | "baseUrl" | "modelId" | "setupBlock";

/** Shared tail for toast/diagnostic success copy after Cursor values are ready. */
export const CURSOR_CUSTOM_MODEL_HANDOFF_HINT =
  "In Cursor Settings > Models, Add Custom Model with the copied Model name, API key, and Base URL, then select that custom model in chat (not Auto).";

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
  const localAgentRunning = status.running;
  const isRunning = localAgentRunning && baseUrl.length > 0 && apiKey.length > 0 && modelId.length > 0;

  if (!isRunning) {
    const needsTunnel = localAgentRunning && !tunnelUrl;
    const tunnelGuidance = needsTunnel ? cursorTunnelGuidance(status.cursorTunnel) : undefined;
    return {
      baseUrl,
      apiKey,
      modelId,
      isRunning: false,
      localAgentRunning,
      setupBlock: needsTunnel
        ? "The Cursor connection is not ready yet."
        : "Start a local model in Local Motion before preparing Cursor.",
      steps: tunnelGuidance?.steps ?? [
        "Start a local model in Local Motion.",
        "Return here to prepare Cursor with the active Base URL and model ID."
      ],
      statusMessage: tunnelGuidance?.statusMessage ??
        (status.message || "Start a local model before configuring Cursor.")
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
    localAgentRunning: true,
    setupBlock,
    steps: [
      "In Cursor Settings → Models, enable OpenAI API Key and paste the key.",
      "Enable Override OpenAI Base URL and paste the Base URL.",
      "Add Custom Model with the exact Model name below.",
      "Select that custom model in chat (not Auto)."
    ],
    statusMessage:
      "Use Model name, API key, and Base URL exactly as shown. If chat says Model name is not valid, that is Cursor-side catalog validation — prove the local stack with curl first."
  };
}

function cursorTunnelBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

/** One source of tunnel-failure facts; steps and statusMessage are projections. */
function cursorTunnelGuidance(tunnel: RuntimeStatus["cursorTunnel"]): { steps: string[]; statusMessage: string } {
  if (tunnel?.error === "invalid-url") {
    return {
      steps: [
        "Set localMotion.cursorTunnelUrl to a public HTTPS tunnel URL.",
        "Localhost, private IPs, plain HTTP, and invalid URLs cannot be used with Cursor."
      ],
      statusMessage:
        "localMotion.cursorTunnelUrl must be a public HTTPS tunnel URL. Cursor's backend cannot reach localhost or private network URLs."
    };
  }
  if (tunnel?.error === "binary-missing") {
    return {
      steps: [
        "Local Motion could not install its connection helper (cloudflared).",
        "Install Homebrew, then turn the local agent off and on — or set localMotion.cursorTunnelUrl to a public HTTPS tunnel."
      ],
      statusMessage:
        "Local Motion could not install its connection helper (cloudflared). Install Homebrew and turn the local agent off and on, or set localMotion.cursorTunnelUrl."
    };
  }
  if (tunnel?.error === "start-timeout" || tunnel?.error === "dns-unresolved") {
    return {
      steps: [
        "The Cursor connection did not become reachable.",
        "Turn the local agent off and on to retry, or set localMotion.cursorTunnelUrl to a public HTTPS tunnel."
      ],
      statusMessage:
        "The Cursor connection did not become reachable. Turn the local agent off and on to retry, or set localMotion.cursorTunnelUrl."
    };
  }
  if (tunnel?.error === "exited") {
    return {
      steps: [
        "The Cursor connection stopped.",
        "Turn the local agent off and on to reconnect, or set localMotion.cursorTunnelUrl to a public HTTPS tunnel."
      ],
      statusMessage:
        "The Cursor connection stopped. Turn the local agent off and on to reconnect, or set localMotion.cursorTunnelUrl."
    };
  }
  if (!tunnel?.enabled) {
    // Local compute is up; Cursor handoff is a second explicit step.
    // Host-agnostic on purpose (no appName): VS Code uses vscode.lm without a
    // tunnel; Cursor needs Connect to Cursor for the public Base URL.
    return {
      steps: [
        "Click Connect to Cursor.",
        "Local Motion creates a public Base URL and copies the setup values."
      ],
      statusMessage:
        "Cursor cannot use localhost. Connect once to create a public Base URL."
    };
  }
  return {
    steps: ["Connecting to Cursor.", "This can take a minute the first time."],
    statusMessage: "Connecting to Cursor…"
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

/**
 * Non-reversible fingerprint of the per-session proxy API key. Every model
 * (re)start mints a new key, so freshness must notice rotation even when the
 * tunnel URL and model id are unchanged — without ever persisting the secret.
 * A truncated SHA-256 is enough to compare identity and useless to recover
 * the key from.
 */
export function cursorApiKeyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
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
    apiKeyFingerprint: cursorApiKeyFingerprint(viewModel.apiKey),
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
    // Prefer the view-model statusMessage so tunnel errors (binary-missing,
    // invalid-url, exited, …) are not collapsed into a generic reconnect nudge.
    // localAgentRunning is explicit RuntimeStatus.running — not credential presence.
    if (viewModel.localAgentRunning) {
      return {
        status: "stale",
        message: `${viewModel.statusMessage} Last copied values were for ${lastCopied.modelId} at ${lastCopied.baseUrl}.`,
        lastCopied
      };
    }
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

  // A restart mints a new session key at the same tunnel URL and model id,
  // so URL/model equality alone can report copied values as current while
  // Cursor 401s with the old key. Records without a fingerprint predate this
  // check and cannot prove the key still matches — treat them as stale too.
  if (lastCopied.apiKeyFingerprint !== cursorApiKeyFingerprint(viewModel.apiKey)) {
    return {
      status: "stale",
      message: `Cursor setup values are stale. The session API key changed since they were copied for ${viewModel.modelId} at ${viewModel.baseUrl} — copy the setup again and update Cursor's API key.`,
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
