import type { CursorSetupFreshness } from "../cursor/cursorIntegration";

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
      message: "No Local Motion model is installed. Run Local Motion: Automagical Setup.",
      lines
    };
  }
  if (!input.installedFileValid) {
    return {
      status: "action-needed",
      message: "The installed model file is missing or incomplete. Run Local Motion: Retry Automagical Setup.",
      lines
    };
  }
  if (!input.runtimeRunning) {
    return {
      status: "action-needed",
      message: "The local model is installed but not running. Run Local Motion: Prepare Cursor.",
      lines
    };
  }
  if (!input.endpointVerified) {
    return {
      status: "action-needed",
      message: "The local proxy did not verify. Run Local Motion: Prepare Cursor after the model starts.",
      lines
    };
  }
  if (input.cursorSetupFreshness !== "current" || !input.completedForInstalledModel) {
    return {
      status: "action-needed",
      message: "Local runtime is healthy, but Cursor setup values need to be copied again. Run Local Motion: Prepare Cursor.",
      lines
    };
  }

  return {
    status: "ready",
    message: "Local Motion setup is ready. Verify the model is selected in Cursor's model picker.",
    lines
  };
}
