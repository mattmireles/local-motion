import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("automagical setup settings describe fallback repositories", async () => {
  const packageJson = await readPackageJson();
  const properties = packageJson.contributes.configuration.properties;
  // Structural, not exact: the default repo is maintained from the live ranking
  // by scripts/refresh-model-ranking.mjs (see README/Notes/model-selection.md).
  const defaultRepo = properties["localMotion.defaultModelRepo"].default;
  assert.match(defaultRepo, /^[^/]+\/.+-GGUF$/i);
  assert.match(defaultRepo, /coder/i);
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

test("setup first screen is a single on/off switch before one advanced disclosure", async () => {
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");

  // The live switch and the connect beat appear before the single Advanced disclosure.
  const primaryIndex = panelSource.indexOf('id="primary"');
  const connectIndex = panelSource.indexOf('id="connect"');
  const advancedIndex = panelSource.indexOf("<summary>Advanced</summary>");
  assert.notEqual(primaryIndex, -1);
  assert.notEqual(connectIndex, -1);
  assert.notEqual(advancedIndex, -1);
  assert.equal(primaryIndex < advancedIndex, true);
  assert.equal(connectIndex < advancedIndex, true);

  // The old four-triangle wizard layout is gone: exactly one disclosure now.
  assert.equal(panelSource.includes("Advanced model controls"), false);
  assert.equal(panelSource.includes("Cursor connection details"), false);
  assert.equal(panelSource.includes("Mac and memory details"), false);
  assert.equal(panelSource.includes('class="hero"'), false);
  assert.equal(panelSource.includes("header-actions"), false);

  // The primary control never morphs into Connect, and there is no second
  // memory button anywhere (both were audit P0/P1 hazards).
  assert.equal(panelSource.includes("'Connect Cursor'"), false);
  assert.equal(panelSource.includes("memoryAction"), false);

  // The primary toggle binds to runtime on/off only: stop when running, else turn on.
  assert.match(
    panelSource,
    /els\.primary\.addEventListener\('click'[\s\S]*?state\.runtime && state\.runtime\.running[\s\S]*?command: 'stop'[\s\S]*?command: 'automagicalSetup'/
  );
  assert.match(panelSource, /els\.primary\.textContent = 'Turn On Local Agent'/);
  assert.match(panelSource, /els\.primary\.textContent = 'Turn Off Local Agent'/);

  // The connect beat is one copy action against the full setup block, not a
  // four-field copy table.
  assert.match(panelSource, /command: 'copyCursorValue', key: 'setupBlock'/);
});

test("setup surface shows downloaded model storage before advanced controls", async () => {
  const protocolSource = await readText("../src/setupProtocol.ts");
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");
  const storageSource = await readText("../src/ui/setupPanelStorage.ts");
  const panelHostSource = await readText("../src/ui/setupPanel.ts");

  assert.match(protocolSource, /downloadedModels: DownloadedModelEntry\[\]/);
  assert.match(protocolSource, /downloadedModelsSizeBytes: number/);
  assert.match(protocolSource, /SetupInstalledModelView/);
  assert.equal(protocolSource.includes("InstalledModel,"), false);
  assert.equal(protocolSource.includes("installed?: InstalledModel"), false);
  assert.equal(protocolSource.includes("installed: InstalledModel"), false);
  assert.match(protocolSource, /deleteDownloadedModel/);
  assert.match(controllerSource, /listDownloadedModels/);
  assert.match(controllerSource, /deleteDownloadedModel\(this\.modelsRoot\(\), id\)/);
  assert.match(controllerSource, /This will turn off the local agent first/);
  assert.match(panelHostSource, /case "deleteDownloadedModel"/);
  assert.match(panelHostSource, /Wait for setup to finish before deleting downloaded models/);
  assert.match(panelHostSource, /postInitialRuntimeState\(\)\.catch/);

  const storageIndex = panelSource.indexOf("setupPanelStorageMarkup()");
  const advancedIndex = panelSource.indexOf("<summary>Advanced</summary>");
  assert.notEqual(storageIndex, -1);
  assert.notEqual(advancedIndex, -1);
  assert.equal(storageIndex < advancedIndex, true);
  assert.match(storageSource, /id="manageStorage"/);
  assert.match(storageSource, /aria-expanded="false"/);
  assert.match(storageSource, /aria-controls="storagePanel"/);
  assert.match(storageSource, /aria-label="Delete /);
  assert.match(storageSource, /state\.setupOperationRunning \? ' disabled' : ''/);
  assert.match(panelSource, /setupOperationRunning: false/);
  assert.match(panelSource, /state\.setupOperationRunning = true/);
  assert.match(panelSource, /installModelSelected/);
  assert.match(panelSource, /selectedModelName/);
  assert.match(panelSource, /Downloading ' \+ modelProgressName\(\)/);
  assert.match(panelSource, /Model budget/);
  assert.match(storageSource, /command: 'deleteDownloadedModel'/);
  assert.match(panelSource, /setupPanelStorageScript\(\)/);
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

test("model download is never gated on current free memory; only loading checks RAM", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");

  // The pre-download memory gate is gone. A multi-GB download takes a long
  // time and however much RAM happens to be free right now is irrelevant until
  // the model is actually loaded — so it must not block the download.
  assert.equal(controllerSource.includes("assertReadyToStartCandidate"), false);

  // There is exactly one runtime-memory gate, and it lives on the load path.
  const gateCalls = controllerSource.match(/this\.assertCurrentMemoryReady\(/g) ?? [];
  assert.equal(gateCalls.length, 1);
  assert.match(controllerSource, /assertReadyToStartInstalledModel\(installed\)/);

  // In installAndStart, the download runs first; the memory gate only fires
  // afterwards, inside startInstalledModel.
  const installStart = controllerSource.indexOf("private async installAndStart");
  const downloadIndex = controllerSource.indexOf("this.download(candidate", installStart);
  const startIndex = controllerSource.indexOf("this.startInstalledModel(installed", installStart);
  assert.notEqual(downloadIndex, -1);
  assert.notEqual(startIndex, -1);
  assert.equal(downloadIndex < startIndex, true);
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

test("runtime status surfaces the first real Cursor request", async () => {
  const proxySource = await readText("../out/runtime/openAiProxy.js");
  const runtimeSource = await readText("../out/runtime/llamaServer.js");
  const typesSource = await readText("../src/types.ts");

  // The proxy records, exposes, and notifies on the first inbound chat request.
  assert.match(proxySource, /hasServedClientRequest/);
  assert.match(proxySource, /onClientRequest/);

  // noteClientRequest is both defined and called (at least two references), and
  // the call lands in the chat-completions branch, which follows /v1/models in
  // handle(). The behavioral proof that /v1/models does not count is in
  // pure-logic; here we just confirm the flag is wired to chat completions.
  assert.equal(proxySource.split("noteClientRequest").length - 1 >= 2, true);
  assert.equal(proxySource.indexOf("noteClientRequest()") > proxySource.indexOf("/v1/models"), true);

  // The manager threads the flag through RuntimeStatus and re-pushes on use.
  assert.match(runtimeSource, /clientObserved/);
  assert.match(runtimeSource, /hasServedClientRequest/);
  assert.match(runtimeSource, /onClientRequest/);
  assert.match(typesSource, /clientObserved\?: boolean/);
});

test("setup ON state confirms a real Cursor request without re-nagging", async () => {
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");

  // The earned, confident line appears only when a real request was observed.
  assert.match(panelSource, /Cursor is using your local model\./);
  assert.match(panelSource, /runtime\.clientObserved/);

  // The inUse branch runs before the freshness branch and suppresses the
  // connect beat plus the model-menu nudge (nothing left to do once in use).
  const inUseBranch = panelSource.indexOf("if (inUse) {");
  const currentBranch = panelSource.indexOf("} else if (current && !handoffFailed) {");
  assert.notEqual(inUseBranch, -1);
  assert.notEqual(currentBranch, -1);
  assert.equal(inUseBranch < currentBranch, true);
});

async function readPackageJson() {
  return JSON.parse(await readText("../package.json"));
}

async function readText(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}
