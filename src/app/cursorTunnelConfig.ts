import * as vscode from "vscode";
import { normalizePublicHttpsTunnelUrl } from "../cursor/tunnelUrl";
import type { CursorTunnelConfig } from "../runtime/llamaServer";

/**
 * The tunnel is not a preference — it is a structural fact of the host app.
 * Cursor's backend can only reach a public HTTPS URL, so inside Cursor the
 * tunnel is the only working path and always starts with the model. Inside
 * real VS Code the vscode.lm provider path is fully local and no tunnel ever
 * starts. There is deliberately no boolean setting for this: a switch whose
 * "off" position cannot work in Cursor and whose "on" position is pointless
 * in VS Code would only exist to be silently flipped.
 *
 * localMotion.cursorTunnelUrl remains the one explicit override: setting a
 * user-managed public HTTPS tunnel enables the Cursor path in any host.
 */
export function cursorTunnelConfigFromWorkspace(): CursorTunnelConfig {
  const config = vscode.workspace.getConfiguration("localMotion");
  const manual = normalizePublicHttpsTunnelUrl(config.get<string>("cursorTunnelUrl", ""));
  return {
    enabled: isCursorHost() || manual.invalid || manual.url !== undefined,
    manualUrl: manual.url,
    manualUrlInvalid: manual.invalid
  };
}

function isCursorHost(): boolean {
  return vscode.env.appName.toLowerCase().includes("cursor");
}
