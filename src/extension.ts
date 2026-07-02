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
import { SetupViewProvider } from "./ui/setupPanel";

let runtime: LlamaServerManager | undefined;
let statusBar: vscode.StatusBarItem | undefined;
let setupView: SetupViewProvider | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await fs.promises.mkdir(context.globalStorageUri.fsPath, { recursive: true });

  const output = vscode.window.createOutputChannel("Local Motion");
  const state = new LocalMotionState(context);
  let provider!: LocalMotionProvider;
  runtime = new LlamaServerManager(output, () => {
    provider.refresh();
    refreshStatusBar();
    void setupView?.refresh();
  });
  const resolver = new LlamaServerResolver(output);
  provider = new LocalMotionProvider(context, runtime, resolver, () => state.installedModel());
  const controller = new LocalMotionController(context, state, runtime, resolver, provider);
  setupView = new SetupViewProvider(controller, output);
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  refreshStatusBar();

  context.subscriptions.push(output);
  context.subscriptions.push(statusBar);
  context.subscriptions.push(vscode.lm.registerLanguageModelChatProvider("local-motion", provider));
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SetupViewProvider.viewType, setupView, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.open", async () => {
      await setupView?.show();
      refreshStatusBar();
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.turnOn", async () => {
      await runAutomagicalSetupCommand(setupView);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.automagicalSetup", async () => {
      await runAutomagicalSetupCommand(setupView);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.retryAutomagicalSetup", async () => {
      await runAutomagicalSetupCommand(setupView);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.prepareCursor", async () => {
      await prepareCursorCommand(controller, output, setupView);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.diagnoseSetup", async () => {
      await diagnoseSetupCommand(controller, output);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.freeMemory", async () => {
      await stopLocalAgent(provider, setupView);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("localMotion.stop", async () => {
      await stopLocalAgent(provider, setupView);
    })
  );

  if (!await maybeResumeAutomagicalSetup(state, controller, output, setupView) && !await maybeRunFirstStartupAutomagicalSetup(state, setupView)) {
    await maybeOpenSetupOnboarding(state, setupView);
  }
}

export async function deactivate(): Promise<void> {
  await runtime?.stop();
}

async function runAutomagicalSetupCommand(setupViewProvider: SetupViewProvider | undefined): Promise<void> {
  setStatusBarBusy("Starting local agent...");
  try {
    const result = await setupViewProvider?.runAutomagicalSetup();
    if (result) {
      await vscode.window.showInformationMessage("Local Motion local agent is on. Use Connect Cursor when you want Cursor chat to use it.");
    }
  } catch {
    // The setup side panel reports command-started automagical errors into the webview.
  } finally {
    refreshStatusBar();
  }
}

async function prepareCursorCommand(
  controller: LocalMotionController,
  output: vscode.OutputChannel,
  setupViewProvider: SetupViewProvider | undefined
): Promise<void> {
  await setupViewProvider?.show();
  const result = await controller.connectCursor();
  await setupViewProvider?.refresh();
  refreshStatusBar();
  output.appendLine([result.verification.message, result.copy.message, result.settings.message].join(" "));
  if (result.verification.ok && result.copy.ok && result.settings.ok) {
    await vscode.window.showInformationMessage("Cursor setup is ready. In Cursor Settings > Models, click Add Custom Model if Local Motion is not listed.");
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
  setupViewProvider: SetupViewProvider | undefined
): Promise<void> {
  const enabled = vscode.workspace.getConfiguration("localMotion").get<boolean>("openSetupOnStartup", true);
  if (!shouldOpenSetupOnboarding({
    enabled,
    alreadyOpened: state.setupOnboardingOpened(),
    hasInstalledModel: state.installedModel() !== undefined
  })) {
    return;
  }

  await setupViewProvider?.show();
  await state.markSetupOnboardingOpened();
}

async function maybeResumeAutomagicalSetup(
  state: LocalMotionState,
  controller: LocalMotionController,
  output: vscode.OutputChannel,
  setupViewProvider: SetupViewProvider | undefined
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

  setStatusBarBusy("Starting local agent...");
  void resumeAutomagicalSetupInBackground(controller, output, setupViewProvider);
  return true;
}

async function resumeAutomagicalSetupInBackground(
  controller: LocalMotionController,
  output: vscode.OutputChannel,
  setupViewProvider: SetupViewProvider | undefined
): Promise<void> {
  try {
    const result = await controller.resumeAutomagicalRuntime();
    refreshStatusBar();
    if (result?.cursorSetupFreshness.status === "stale") {
      const answer = await vscode.window.showWarningMessage(
        result.cursorSetupFreshness.message,
        "Open Local Agent"
      );
      if (answer === "Open Local Agent") {
        await setupViewProvider?.show();
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Automagical startup resume failed: ${message}`);
    refreshStatusBar();
    const answer = await vscode.window.showWarningMessage(
      `Local Motion could not restart automatically: ${message}`,
      "Open Local Agent"
    );
    if (answer === "Open Local Agent") {
      await setupViewProvider?.show();
    }
  }
}

async function maybeRunFirstStartupAutomagicalSetup(
  state: LocalMotionState,
  setupViewProvider: SetupViewProvider | undefined
): Promise<boolean> {
  const enabled = vscode.workspace.getConfiguration("localMotion").get<boolean>("runAutomagicalSetupOnFirstStartup", false);
  if (!shouldRunFirstStartupAutomagicalSetup({
    enabled,
    alreadyOpened: state.setupOnboardingOpened(),
    hasInstalledModel: state.installedModel() !== undefined,
    runtimeRunning: runtime?.status().running ?? false
  })) {
    return false;
  }

  setStatusBarBusy("Starting local agent...");
  void setupViewProvider?.runAutomagicalSetup(() => state.markSetupOnboardingOpened())
    .catch(() => undefined)
    .finally(() => {
      refreshStatusBar();
    });
  return true;
}

async function stopLocalAgent(provider: LocalMotionProvider, setupViewProvider: SetupViewProvider | undefined): Promise<void> {
  await runtime?.stop();
  provider.refresh();
  refreshStatusBar();
  await setupViewProvider?.refresh();
  await vscode.window.showInformationMessage("Local Motion freed the model memory.");
}

function refreshStatusBar(): void {
  if (!statusBar) {
    return;
  }

  const status = runtime?.status();
  if (status?.running) {
    statusBar.text = "$(circle-filled) Local Agent: On";
    statusBar.tooltip = `${status.modelId ?? "Local Motion"} is loaded. Click to free memory.`;
    statusBar.command = "localMotion.freeMemory";
  } else {
    statusBar.text = "$(circle-large-outline) Local Agent: Off";
    statusBar.tooltip = "Click to turn on the local coding agent for Cursor.";
    statusBar.command = "localMotion.turnOn";
  }
  statusBar.show();
}

function setStatusBarBusy(tooltip: string): void {
  if (!statusBar) {
    return;
  }
  statusBar.text = "$(sync~spin) Local Agent: Starting";
  statusBar.tooltip = tooltip;
  statusBar.command = "localMotion.open";
  statusBar.show();
}
