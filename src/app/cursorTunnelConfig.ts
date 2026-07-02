import * as vscode from "vscode";
import { normalizePublicHttpsTunnelUrl } from "../cursor/tunnelUrl";
import type { CursorTunnelConfig } from "../runtime/llamaServer";

/**
 * The tunnel is not part of turning on local compute. Cursor's backend can
 * only reach a public HTTPS URL, so the tunnel starts only when the user runs
 * the Cursor handoff. Inside real VS Code the vscode.lm provider path is fully
 * local and no tunnel starts.
 *
 * localMotion.cursorTunnelUrl remains the one explicit override: setting a
 * user-managed public HTTPS tunnel enables the Cursor path in any host.
 */
export function cursorTunnelConfigFromWorkspace(options: { forceCursor?: boolean } = {}): CursorTunnelConfig {
  const config = vscode.workspace.getConfiguration("localMotion");
  const manual = normalizePublicHttpsTunnelUrl(config.get<string>("cursorTunnelUrl", ""));
  return {
    enabled: options.forceCursor === true || manual.invalid || manual.url !== undefined,
    manualUrl: manual.url,
    manualUrlInvalid: manual.invalid
  };
}
