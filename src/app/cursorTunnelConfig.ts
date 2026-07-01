import * as vscode from "vscode";
import { normalizePublicHttpsTunnelUrl } from "../cursor/tunnelUrl";
import type { CursorTunnelConfig } from "../runtime/llamaServer";

export function cursorTunnelConfigFromWorkspace(): CursorTunnelConfig {
  const config = vscode.workspace.getConfiguration("localMotion");
  const manual = normalizePublicHttpsTunnelUrl(config.get<string>("cursorTunnelUrl", ""));
  return {
    enabled: config.get<boolean>("cursorTunnel", false) || manual.invalid || manual.url !== undefined,
    manualUrl: manual.url,
    manualUrlInvalid: manual.invalid
  };
}
