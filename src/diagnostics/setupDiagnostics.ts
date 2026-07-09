import type { CursorSetupFreshness } from "../cursor/cursorIntegration";
import { CURSOR_CUSTOM_MODEL_HANDOFF_HINT } from "../cursor/cursorIntegration";

export interface SetupDiagnosticInput {
  installedModelId?: string;
  installedFileValid: boolean;
  runtimeRunning: boolean;
  runtimeBaseUrl?: string;
  runtimeModelId?: string;
  endpointVerified: boolean;
  cursorSetupFreshness: CursorSetupFreshness["status"];
  completedForInstalledModel: boolean;
}

export interface SetupDiagnosticSummary {
  status: "ready" | "action-needed";
  message: string;
  lines: string[];
}

export function setupDiagnosticSummary(input: SetupDiagnosticInput): SetupDiagnosticSummary {
  const lines = [
    `Installed model: ${input.installedModelId ?? "none"}`,
    `Installed file valid: ${input.installedFileValid ? "yes" : "no"}`,
    `Runtime: ${input.runtimeRunning ? `running at ${input.runtimeBaseUrl ?? "unknown endpoint"}` : "stopped"}`,
    `Runtime model: ${input.runtimeModelId ?? "none"}`,
    `Local endpoint verified: ${input.endpointVerified ? "yes" : "no"}`,
    `Copied Cursor setup: ${input.cursorSetupFreshness}`,
    `Automagical completion: ${input.completedForInstalledModel ? "matches installed model" : "not complete for installed model"}`,
    "Cursor picker: verify manually in Cursor because Local Motion does not read or write Cursor private state."
  ];

  if (!input.installedModelId) {
    return {
      status: "action-needed",
      message: "No Local Motion model is installed. Run Local Motion: Turn On Local Agent.",
      lines
    };
  }
  if (!input.installedFileValid) {
    return {
      status: "action-needed",
      message: "The installed model file is missing or incomplete. Run Local Motion: Repair Local Agent.",
      lines
    };
  }
  if (!input.runtimeRunning) {
    return {
      status: "action-needed",
      message: "The local model is installed but not running. Run Local Motion: Connect Cursor to Local Agent.",
      lines
    };
  }
  if (!input.endpointVerified) {
    return {
      status: "action-needed",
      message: "The local proxy did not verify. Run Local Motion: Connect Cursor to Local Agent after the model starts.",
      lines
    };
  }
  if (input.cursorSetupFreshness !== "current" || !input.completedForInstalledModel) {
    return {
      status: "action-needed",
      message: "Local runtime is healthy, but Cursor setup values need to be copied again. Run Local Motion: Connect Cursor to Local Agent.",
      lines
    };
  }

  return {
    status: "ready",
    message: `Local Motion setup is ready. ${CURSOR_CUSTOM_MODEL_HANDOFF_HINT}`,
    lines
  };
}
