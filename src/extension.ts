import * as fs from "node:fs";
import * as vscode from "vscode";
import { LocalMotionController } from "./app/localMotionController";
import { LocalMotionProvider } from "./provider/localMotionProvider";
import { LlamaServerManager } from "./runtime/llamaServer";
import { LlamaServerResolver } from "./runtime/llamaServerResolver";
import { LocalMotionState } from "./state";
import { SetupPanel } from "./ui/setupPanel";

let runtime: LlamaServerManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await fs.promises.mkdir(context.globalStorageUri.fsPath, { recursive: true });

  const output = vscode.window.createOutputChannel("Local Motion");
  const state = new LocalMotionState(context);
  runtime = new LlamaServerManager(output);
  const resolver = new LlamaServerResolver(output);
  const provider = new LocalMotionProvider(context, runtime, resolver, () => state.installedModel());
  const controller = new LocalMotionController(context, state, runtime, resolver, provider);

  context.subscriptions.push(output);
  context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider("local-motion", provider));
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.open", () => {
      SetupPanel.show(controller, output);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.stop", async () => {
      await runtime?.stop();
      provider.refresh();
      await vscode.window.showInformationMessage("Local Motion model stopped.");
    })
  );
}

export async function deactivate(): Promise<void> {
  await runtime?.stop();
}
