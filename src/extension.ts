import * as fs from "node:fs";
import * as vscode from "vscode";
import { LocalMotionController } from "./app/localMotionController";
import {
  hasCompletedAutomagicalSetupForInstalledModel,
  shouldOpenSetupOnboarding,
  shouldResumeAutomagicalSetup,
  shouldRunFirstStartupAutomagicalSetup
} from "./onboarding";
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
    vscode.commands.registerCommand("localMotion.automagicalSetup", async () => {
      await runAutomagicalSetupCommand(controller, output);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.retryAutomagicalSetup", async () => {
      await runAutomagicalSetupCommand(controller, output);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.prepareCursor", async () => {
      await prepareCursorCommand(controller, output);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.diagnoseSetup", async () => {
      await diagnoseSetupCommand(controller, output);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.stop", async () => {
      await runtime?.stop();
      provider.refresh();
      await vscode.window.showInformationMessage("Local Motion model stopped.");
    })
  );

  if (!await maybeResumeAutomagicalSetup(state, controller, output) && !await maybeRunFirstStartupAutomagicalSetup(state, controller, output)) {
    await maybeOpenSetupOnboarding(state, controller, output);
  }
}

export async function deactivate(): Promise<void> {
  await runtime?.stop();
}

async function runAutomagicalSetupCommand(controller: LocalMotionController, output: vscode.OutputChannel): Promise<void> {
  try {
    const result = await SetupPanel.runAutomagicalSetup(controller, output);
    if (result) {
      await vscode.window.showInformationMessage("Local Motion automagical setup is ready for Cursor.");
    }
  } catch {
    // SetupPanel reports command-started automagical errors into the webview.
  }
}

async function prepareCursorCommand(controller: LocalMotionController, output: vscode.OutputChannel): Promise<void> {
  const result = await controller.prepareCursorAfterStartingInstalledModel();
  output.appendLine([result.verification.message, result.copy.message, result.settings.message].join(" "));
  if (result.verification.ok && result.copy.ok && result.settings.ok) {
    await vscode.window.showInformationMessage("Local Motion Cursor setup block copied and Cursor Models settings opened.");
    return;
  }

  await vscode.window.showWarningMessage([result.verification.message, result.copy.message, result.settings.message].join(" "));
}

async function diagnoseSetupCommand(controller: LocalMotionController, output: vscode.OutputChannel): Promise<void> {
  const result = await controller.diagnoseSetup();
  output.appendLine("Local Motion setup diagnostic:");
  for (const line of result.lines) {
    output.appendLine(`- ${line}`);
  }
  output.show(true);
  if (result.status === "ready") {
    await vscode.window.showInformationMessage(result.message);
    return;
  }
  await vscode.window.showWarningMessage(result.message);
}

async function maybeOpenSetupOnboarding(
  state: LocalMotionState,
  controller: LocalMotionController,
  output: vscode.OutputChannel
): Promise<void> {
  const enabled = vscode.workspace.getConfiguration("localMotion").get<boolean>("openSetupOnStartup", true);
  if (!shouldOpenSetupOnboarding({
    enabled,
    alreadyOpened: state.setupOnboardingOpened(),
    hasInstalledModel: state.installedModel() !== undefined
  })) {
    return;
  }

  await state.markSetupOnboardingOpened();
  SetupPanel.show(controller, output);
}

async function maybeResumeAutomagicalSetup(
  state: LocalMotionState,
  controller: LocalMotionController,
  output: vscode.OutputChannel
): Promise<boolean> {
  const enabled = vscode.workspace.getConfiguration("localMotion").get<boolean>("resumeAutomagicalSetupOnStartup", true);
  const installedModel = state.installedModel();
  if (!shouldResumeAutomagicalSetup({
    enabled,
    hasCompletedSetupForInstalledModel: hasCompletedAutomagicalSetupForInstalledModel(
      installedModel,
      state.automagicalSetupCompletion()
    ),
    runtimeRunning: runtime?.status().running ?? false
  })) {
    return false;
  }

  void resumeAutomagicalSetupInBackground(controller, output);
  return true;
}

async function resumeAutomagicalSetupInBackground(
  controller: LocalMotionController,
  output: vscode.OutputChannel
): Promise<void> {
  try {
    const result = await controller.resumeAutomagicalRuntime();
    if (result?.cursorSetupFreshness.status === "stale") {
      const answer = await vscode.window.showWarningMessage(
        result.cursorSetupFreshness.message,
        "Open Setup"
      );
      if (answer === "Open Setup") {
        SetupPanel.show(controller, output);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Automagical startup resume failed: ${message}`);
    const answer = await vscode.window.showWarningMessage(
      `Local Motion could not restart automatically: ${message}`,
      "Open Setup"
    );
    if (answer === "Open Setup") {
      SetupPanel.show(controller, output);
    }
  }
}

async function maybeRunFirstStartupAutomagicalSetup(
  state: LocalMotionState,
  controller: LocalMotionController,
  output: vscode.OutputChannel
): Promise<boolean> {
  const enabled = vscode.workspace.getConfiguration("localMotion").get<boolean>("runAutomagicalSetupOnFirstStartup", true);
  if (!shouldRunFirstStartupAutomagicalSetup({
    enabled,
    alreadyOpened: state.setupOnboardingOpened(),
    hasInstalledModel: state.installedModel() !== undefined,
    runtimeRunning: runtime?.status().running ?? false
  })) {
    return false;
  }

  await state.markSetupOnboardingOpened();
  void SetupPanel.runAutomagicalSetup(controller, output).catch(() => undefined);
  return true;
}
