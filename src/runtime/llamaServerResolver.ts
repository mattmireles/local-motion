import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import { promisify } from "node:util";
import * as vscode from "vscode";

const execFile = promisify(childProcess.execFile);

export class LlamaServerResolver {
  constructor(private readonly output: vscode.OutputChannel) {}

  async resolve(options: { allowInstall: boolean; token?: vscode.CancellationToken }): Promise<string> {
    throwIfCancelled(options.token);
    const configured = vscode.workspace.getConfiguration("localMotion").get<string>("llamaServerPath", "").trim();
    const candidates = [
      configured,
      await commandPath("llama-server"),
      "/opt/homebrew/bin/llama-server",
      "/usr/local/bin/llama-server"
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (await executableExists(candidate)) {
        return candidate;
      }
    }

    if (!options.allowInstall) {
      throw new Error('llama-server is not available. Open Local Motion setup or install it with "brew install llama.cpp".');
    }

    const brew = await commandPath("brew");
    if (brew) {
      throwIfCancelled(options.token);
      const answer = await vscode.window.showWarningMessage(
        "Local Motion needs llama-server. Install llama.cpp with Homebrew now?",
        "Install",
        "Cancel"
      );
      if (answer !== "Install") {
        throw new Error('llama-server was not found. Install it with "brew install llama.cpp" or set localMotion.llamaServerPath.');
      }
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Installing llama.cpp with Homebrew",
          cancellable: false
        },
        async () => {
          throwIfCancelled(options.token);
          this.output.appendLine("llama-server not found. Running brew install llama.cpp.");
          await execFile(brew, ["install", "llama.cpp"], { timeout: 20 * 60 * 1000 });
        }
      );
      const installed = await commandPath("llama-server");
      if (installed) {
        return installed;
      }
    }

    throw new Error('llama-server was not found. Install it with "brew install llama.cpp" or set localMotion.llamaServerPath.');
  }
}

async function commandPath(command: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFile("/usr/bin/which", [command]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function executableExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function throwIfCancelled(token: vscode.CancellationToken | undefined): void {
  if (token?.isCancellationRequested) {
    throw new Error("Local model startup was cancelled.");
  }
}
