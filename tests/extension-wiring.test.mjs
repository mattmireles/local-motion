import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("automagical setup settings describe fallback repositories", async () => {
  const packageJson = await readPackageJson();
  const properties = packageJson.contributes.configuration.properties;
  assert.equal(properties["localMotion.defaultModelRepo"].default, "yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF");
  assert.match(properties["localMotion.defaultModelRepo"].description, /tried first/);
  assert.match(properties["localMotion.defaultModelRepo"].description, /fallback repositories/);
  assert.match(properties["localMotion.runAutomagicalSetupOnFirstStartup"].description, /default or fallback repositories/);
});

test("native language model provider config opens the local agent switch", async () => {
  const packageJson = await readPackageJson();
  const provider = packageJson.contributes.languageModelChatProviders.find((candidate) => candidate.vendor === "local-motion");
  assert.equal(provider?.displayName, "Local Motion");
  assert.equal(provider?.managementCommand, "localMotion.open");
});

test("local agent is contributed as a visible Activity Bar side panel", async () => {
  const packageJson = await readPackageJson();
  const container = packageJson.contributes.viewsContainers.activitybar.find((candidate) => candidate.id === "localMotion");
  assert.equal(container?.title, "Local Motion");
  assert.equal(container?.icon, "media/local-motion.svg");
  assert.equal(packageJson.activationEvents.includes("onView:localMotion.agentView"), true);

  const view = packageJson.contributes.views.localMotion.find((candidate) => candidate.id === "localMotion.agentView");
  assert.equal(view?.name, "Local Agent");
  assert.equal(view?.type, "webview");

  const extensionSource = await readText("../out/extension.js");
  const panelSource = await readText("../out/ui/setupPanel.js");
  assert.match(extensionSource, /registerWebviewViewProvider/);
  assert.match(extensionSource, /SetupViewProvider\.viewType/);
  assert.match(panelSource, /workbench\.view\.extension\.localMotion/);
});

test("automagical dependency install has no second confirmation prompt", async () => {
  const resolverSource = await readText("../out/runtime/llamaServerResolver.js");
  assert.equal(resolverSource.includes("showWarningMessage"), false);
  assert.equal(resolverSource.includes("withProgress"), true);
});

test("host-started automagical setup reports errors to the webview", async () => {
  const panelSource = await readText("../out/ui/setupPanel.js");
  assert.equal(panelSource.includes("hostStartedAutomagicalSetup"), true);
  assert.equal(panelSource.includes("type: \"error\""), true);
});

test("retry automagical setup command is registered and contributed", async () => {
  const packageJson = await readPackageJson();
  const commands = packageJson.contributes.commands.map((command) => command.command);
  assert.equal(packageJson.activationEvents.includes("onCommand:localMotion.retryAutomagicalSetup"), true);
  assert.equal(commands.includes("localMotion.retryAutomagicalSetup"), true);

  const extensionSource = await readText("../out/extension.js");
  assert.equal(extensionSource.includes("localMotion.retryAutomagicalSetup"), true);
});

test("local agent switch commands and status bar are registered", async () => {
  const packageJson = await readPackageJson();
  const commands = packageJson.contributes.commands.map((command) => command.command);
  assert.equal(packageJson.activationEvents.includes("onCommand:localMotion.turnOn"), true);
  assert.equal(packageJson.activationEvents.includes("onCommand:localMotion.freeMemory"), true);
  assert.equal(packageJson.activationEvents.includes("onCommand:localMotion.stop"), false);
  assert.equal(commands.includes("localMotion.turnOn"), true);
  assert.equal(commands.includes("localMotion.freeMemory"), true);
  assert.equal(commands.includes("localMotion.stop"), false);
  assert.equal(packageJson.contributes.configuration.properties["localMotion.runAutomagicalSetupOnFirstStartup"].default, false);

  const extensionSource = await readText("../out/extension.js");
  assert.match(extensionSource, /Local Agent: Off/);
  assert.match(extensionSource, /Local Agent: Starting/);
  assert.match(extensionSource, /Local Agent: On/);
  assert.match(extensionSource, /localMotion\.freeMemory/);
});

test("setup first screen is a local agent appliance before advanced details", async () => {
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");
  const heroIndex = panelSource.indexOf('class="hero"');
  const modelDetailsIndex = panelSource.indexOf("<summary>Advanced model controls</summary>");
  const activityLogIndex = panelSource.indexOf("<summary>Activity log</summary>");
  assert.notEqual(heroIndex, -1);
  assert.notEqual(modelDetailsIndex, -1);
  assert.notEqual(activityLogIndex, -1);
  assert.equal(heroIndex < modelDetailsIndex, true);
  assert.equal(heroIndex < activityLogIndex, true);
  assert.equal(panelSource.includes("header-actions"), false);
  assert.match(panelSource, /document\.getElementById\('memoryAction'\)\.addEventListener\('click', \(\) => \{\s+vscode\.postMessage\(\{ command: 'stop' \}\);/);
  assert.match(panelSource, /running \? \(current \? 'Free Memory' : 'Connect Cursor'\) : 'Turn On Local Agent'/);
});

test("Cursor setup instructions match Cursor's Add Custom Model flow", async () => {
  const cursorSource = await readText("../out/cursor/cursorIntegration.js");
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");
  assert.match(cursorSource, /Click Add Custom Model/);
  assert.match(cursorSource, /Cursor Settings > Models/);
  assert.equal(cursorSource.includes("Add or enable an OpenAI-compatible model"), false);
  assert.match(panelSource, /Add Custom Model/);
});

test("runtime status changes refresh provider and native switch", async () => {
  const extensionSource = await readText("../out/extension.js");
  const runtimeSource = await readText("../out/runtime/llamaServer.js");
  assert.match(extensionSource, /new llamaServer_1\.LlamaServerManager\(output, \(\) =>/);
  assert.match(extensionSource, /provider\.refresh\(\)/);
  assert.match(extensionSource, /refreshStatusBar\(\)/);
  assert.match(runtimeSource, /this\.onStatusChanged\(\)/);
});

test("prepare Cursor command is registered and starts a reusable installed model first", async () => {
  const packageJson = await readPackageJson();
  const commands = packageJson.contributes.commands.map((command) => command.command);
  assert.equal(packageJson.activationEvents.includes("onCommand:localMotion.prepareCursor"), true);
  assert.equal(commands.includes("localMotion.prepareCursor"), true);

  const extensionSource = await readText("../out/extension.js");
  const controllerSource = await readText("../out/app/localMotionController.js");
  assert.equal(extensionSource.includes("localMotion.prepareCursor"), true);
  assert.match(extensionSource, /controller\.prepareCursorAfterStartingInstalledModel\(\)/);
  assert.match(controllerSource, /prepareCursorAfterStartingInstalledModel/);
  assert.match(controllerSource, /this\.reusableInstalledModel\(\)/);
  assert.match(controllerSource, /allowLlamaInstallForAutomagicalStart\)\("explicit"\)/);
  assert.match(controllerSource, /return this\.prepareCursor\(\)/);
});

test("diagnose setup command is registered and contributed", async () => {
  const packageJson = await readPackageJson();
  const commands = packageJson.contributes.commands.map((command) => command.command);
  assert.equal(packageJson.activationEvents.includes("onCommand:localMotion.diagnoseSetup"), true);
  assert.equal(commands.includes("localMotion.diagnoseSetup"), true);

  const extensionSource = await readText("../out/extension.js");
  const controllerSource = await readText("../out/app/localMotionController.js");
  assert.equal(extensionSource.includes("localMotion.diagnoseSetup"), true);
  assert.match(extensionSource, /controller\.diagnoseSetup\(\)/);
  assert.match(controllerSource, /setupDiagnosticSummary/);
});

test("manual install and run prepares Cursor automatically", async () => {
  const protocolSource = await readText("../src/setupProtocol.ts");
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const panelHtmlSource = await readText("../out/ui/setupPanelHtml.js");

  assert.match(protocolSource, /cursor\?: CursorSetupPreparedResponse/);
  assert.match(controllerSource, /const cursor = await this\.cursorSetup\.prepareCursorAndMarkCompleted\(\)/);
  assert.match(controllerSource, /cursor\s*[,}]/);
  assert.match(panelHtmlSource, /message\.type === 'installed'/);
  assert.match(panelHtmlSource, /message\.cursor && message\.cursor\.verification/);
  assert.match(panelHtmlSource, /message\.cursor && message\.cursor\.settings/);
});

test("installed model state is committed before provider refresh", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const setStateIndex = controllerSource.indexOf("await this.state.setInstalledModel(installed)");
  const refreshIndex = controllerSource.indexOf("this.provider.refresh()", setStateIndex);
  assert.notEqual(setStateIndex, -1);
  assert.notEqual(refreshIndex, -1);
  assert.equal(setStateIndex < refreshIndex, true);
});

test("startup resume does not prepare Cursor or expose a side-effectful controller method", async () => {
  const extensionSource = await readText("../out/extension.js");
  const controllerSource = await readText("../out/app/localMotionController.js");
  assert.equal(extensionSource.includes("resumeAutomagicalSetupInBackground"), true);
  assert.match(extensionSource, /controller\.resumeAutomagicalRuntime\(\)/);
  assert.equal(extensionSource.includes("controller.resumeAutomagicalSetup()"), false);
  assert.equal(controllerSource.includes("resumeAutomagicalSetup()"), false);
  assert.equal(extensionSource.includes("SetupPanel.resumeAutomagicalSetup"), false);
});

test("startup resume does not install missing llama dependency", async () => {
  const controllerSource = await readText("../out/app/localMotionController.js");
  assert.match(controllerSource, /allowLlamaInstallForAutomagicalStart\)\("explicit"\)/);
  assert.match(controllerSource, /allowLlamaInstallForAutomagicalStart\)\("startupResume"\)/);
});

test("host-started automagical setup hydrates base state before progress", async () => {
  const panelSource = await readText("../out/ui/setupPanel.js");
  const panelHtmlSource = await readText("../out/ui/setupPanelHtml.js");
  const runtimeStateIndex = panelSource.indexOf("await this.postInitialRuntimeState()");
  const readyIndex = panelSource.indexOf("this.markReady()");
  assert.notEqual(runtimeStateIndex, -1);
  assert.notEqual(readyIndex, -1);
  assert.equal(runtimeStateIndex < readyIndex, true);
  assert.equal(panelSource.includes("shouldPostInitialQuantizations"), true);
  assert.equal(panelSource.includes("setupPanelHtml"), true);
  assert.equal(panelHtmlSource.includes("automagicalSetupRunning"), true);
});

test("startup resume setting describes quiet runtime restart", async () => {
  const packageJson = await readPackageJson();
  const description = packageJson.contributes.configuration.properties["localMotion.resumeAutomagicalSetupOnStartup"].description;
  assert.match(description, /restart the installed local model/);
  assert.match(description, /without downloading a new model/);
  assert.match(description, /opening Cursor settings/);
  assert.match(description, /replacing the clipboard/);
  assert.equal(description.includes("prepare Cursor automatically"), false);
});

async function readPackageJson() {
  return JSON.parse(await readText("../package.json"));
}

async function readText(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}
