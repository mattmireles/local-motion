import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// These tests grep compiled/source text rather than executing the webview
// script — there is no DOM harness (e.g. jsdom) in this repo to run that
// script directly. That's a real coverage gap, not an oversight: several
// assertions below exist specifically to pin regressions an earlier audit
// found (see "both were audit P0/P1 hazards"). Adding a DOM testing
// dependency to close the gap is a separate decision, not a drive-by change.

test("automagical setup settings keep Qwen3 as the one-click default", async () => {
  const packageJson = await readPackageJson();
  const properties = packageJson.contributes.configuration.properties;
  const defaultRepo = properties["localMotion.defaultModelRepo"].default;
  assert.equal(defaultRepo, "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF");
  assert.match(properties["localMotion.defaultModelRepo"].description, /Qwen3-Coder/);
  assert.match(properties["localMotion.defaultModelRepo"].description, /Gemma 4 26B A4B/);
  assert.match(properties["localMotion.defaultModelRepo"].description, /not automatic downgrades/);
  assert.match(properties["localMotion.defaultModelRepo"].description, /Qwen2\.5 models are manual Advanced choices/);
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
  assert.equal(panelSource.includes("type: setupProtocol_1.SETUP_RESPONSE_TYPE.ERROR"), true);
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
  const primaryBody = panelSource.slice(
    panelSource.indexOf("els.primary.addEventListener('click'"),
    panelSource.indexOf("/* Each Cursor value copies on its own")
  );
  assert.equal(primaryBody.includes("Connect Cursor"), false);
  assert.equal(panelSource.includes("memoryAction"), false);

  // The primary toggle binds to runtime on/off only: stop when running, else turn on.
  // The webview can't import setupProtocol.ts (it isn't a compiled module in
  // the browser context), so it interpolates SETUP_REQUEST_COMMAND/
  // SETUP_RESPONSE_TYPE into its template literal instead of hand-duplicating
  // the string values — these assertions match that interpolated form.
  assert.match(
    panelSource,
    /els\.primary\.addEventListener\('click'[\s\S]*?state\.runtime && state\.runtime\.running[\s\S]*?command: '\$\{SETUP_REQUEST_COMMAND\.STOP\}'[\s\S]*?command: '\$\{SETUP_REQUEST_COMMAND\.AUTOMAGICAL_SETUP\}'/
  );
  assert.match(panelSource, /function primaryActionText\(option, running\)/);
  assert.match(panelSource, /Install Max \+ Mini, Start/);
  assert.match(panelSource, /return running \? 'Turn Off Local Agent' : 'Turn On Local Agent'/);

  // Each Cursor value copies independently from its own row, so the user can
  // drop them one at a time into Cursor's Add Custom Model fields.
  assert.match(panelSource, /command: '\$\{SETUP_REQUEST_COMMAND\.COPY_CURSOR_VALUE\}', key: button\.dataset\.key/);
  assert.match(panelSource, /data-key="modelId"/);
  assert.match(panelSource, /data-key="apiKey"/);
  assert.match(panelSource, /data-key="baseUrl"/);

  // The toggle gates on disabled, not on a setup flag, so Turn Off is never a
  // dead button while the agent is running.
  assert.match(panelSource, /if \(els\.primary\.disabled\) return;/);
  assert.equal(panelSource.includes("if (state.automagicalSetupRunning) return;"), false);
});

test("setup surface shows downloaded model storage before advanced controls", async () => {
  const protocolSource = await readText("../src/setupProtocol.ts");
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");
  const storageSource = await readText("../src/ui/setupPanelStorage.ts");
  const panelHostSource = await readText("../src/ui/setupPanel.ts");

  assert.match(protocolSource, /downloadedModels: DownloadedModelEntry\[\]/);
  assert.match(protocolSource, /downloadedModelsSizeBytes: number/);
  assert.match(protocolSource, /interface SetupModelOptionView/);
  assert.match(protocolSource, /modelOptions: SetupModelOptionView\[\]/);
  assert.match(protocolSource, /selectedModelOptionId: LocalModelOptionId/);
  assert.match(protocolSource, /REPLACE_MODEL_OPTION: "replaceModelOption"/);
  assert.match(protocolSource, /SetupInstalledModelView/);
  assert.equal(protocolSource.includes("InstalledModel,"), false);
  assert.equal(protocolSource.includes("installed?: InstalledModel"), false);
  assert.equal(protocolSource.includes("installed: InstalledModel"), false);
  assert.match(protocolSource, /deleteDownloadedModel/);
  assert.match(controllerSource, /listDownloadedModels/);
  assert.match(controllerSource, /deleteDownloadedModel\(this\.modelsRoot\(\), id\)/);
  assert.match(controllerSource, /This will turn off the local agent first/);
  assert.match(panelHostSource, /case SETUP_REQUEST_COMMAND\.DELETE_DOWNLOADED_MODEL/);
  assert.match(panelHostSource, /Wait for setup to finish before deleting downloaded models/);
  assert.match(panelHostSource, /postInitialRuntimeState\(\)\.catch/);

  const storageIndex = panelSource.indexOf("setupPanelStorageMarkup()");
  const advancedIndex = panelSource.indexOf("<summary>Advanced</summary>");
  assert.notEqual(storageIndex, -1);
  assert.notEqual(advancedIndex, -1);
  assert.equal(storageIndex < advancedIndex, true);
  // Markup/styles are a real, pure module boundary (setupPanelStorage.ts);
  // the storage *script* is not — it shares one execution scope with the
  // rest of the webview, so it lives directly in setupPanelHtml.ts instead
  // of behind a function call that only fakes a separate module.
  assert.match(storageSource, /id="manageStorage"/);
  assert.match(storageSource, /aria-expanded="false"/);
  assert.match(storageSource, /aria-controls="storagePanel"/);
  assert.match(storageSource, /Model Library/);
  assert.match(storageSource, /storage-badge/);
  assert.equal(storageSource.includes("function renderStorage"), false);
  assert.match(panelSource, /aria-label="Remove /);
  assert.match(panelSource, /state\.setupOperationRunning \? ' disabled' : ''/);
  assert.match(panelSource, /setupOperationRunning: false/);
  assert.match(panelSource, /state\.setupOperationRunning = true/);
  assert.match(panelSource, /SETUP_RESPONSE_TYPE\.INSTALL_MODEL_SELECTED/);
  assert.match(panelSource, /selectedModelName/);
  assert.match(panelSource, /Downloading ' \+ modelProgressName\(\)/);
  assert.match(panelSource, /Model budget/);
  assert.match(panelSource, /command: '\$\{SETUP_REQUEST_COMMAND\.DELETE_DOWNLOADED_MODEL\}'/);
  assert.match(panelSource, /function updateDownloadedStorage\(message\)/);
  assert.match(panelSource, /function renderStorage\(\)/);
  assert.match(panelSource, /id="modelChooser"/);
  assert.match(panelSource, /function renderModelOptions\(\)/);
  assert.match(panelSource, /requiredMemory \+ ' runtime memory'/);
  assert.match(panelSource, /Install Max \+ Mini, Start/);
  assert.match(panelSource, /modelOptionId: option\.id/);
  assert.match(panelSource, /data-replace-option/);
  assert.match(panelSource, /function replaceModelOption\(optionId, repoId\)/);
  assert.match(panelHostSource, /case SETUP_REQUEST_COMMAND\.REPLACE_MODEL_OPTION/);
  assert.match(controllerSource, /async replaceModelOption/);
  assert.match(controllerSource, /setModelSlot\(optionId, installed\)/);
  assert.match(panelSource, /function modelLabel\(fileName\)/);
  assert.match(panelSource, /Max: Qwen3-Coder-30B-A3B/);
  assert.match(panelSource, /Mini: Gemma 4 26B A4B/);
  assert.match(panelSource, />Switch<\/button>/);
});

test("downloaded models can be run directly from storage for manual switching", async () => {
  const protocolSource = await readText("../src/setupProtocol.ts");
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");
  const panelHostSource = await readText("../src/ui/setupPanel.ts");

  // Protocol carries the switch command.
  assert.match(protocolSource, /START_DOWNLOADED_MODEL: "startDownloadedModel"/);
  assert.match(protocolSource, /SETUP_REQUEST_COMMAND\.START_DOWNLOADED_MODEL; id\?: string/);

  // The controller rebuilds an installed model from the on-disk file and
  // reuses the normal start path (which stops the previous server), then
  // persists it as the installed model so restarts pick the switched model.
  assert.match(controllerSource, /async startDownloadedModel\(id: string\)/);
  assert.match(controllerSource, /resolveDownloadedModelId\(this\.modelsRoot\(\), id\)/);
  assert.match(controllerSource, /That download is incomplete/);
  const switchStart = controllerSource.indexOf("async startDownloadedModel");
  const switchStartCall = controllerSource.indexOf("this.startInstalledModel(installed", switchStart);
  const switchPersist = controllerSource.indexOf("await this.state.setInstalledModel(installed)", switchStart);
  const switchBody = controllerSource.slice(switchStart, switchPersist);
  assert.notEqual(switchStartCall, -1);
  assert.notEqual(switchPersist, -1);
  assert.equal(switchStartCall < switchPersist, true);
  assert.match(switchBody, /const slottedModel = this\.localModelPack\(\)/);
  assert.match(switchBody, /this\.state\.modelSlot\(option\.id\)/);
  assert.match(switchBody, /path\.resolve\(slot\.modelPath\) === path\.resolve\(modelPath\)/);
  assert.match(switchBody, /\.\.\.slottedModel/);
  assert.match(switchBody, /modelId: LOCAL_MOTION_MODEL_ID/);
  assert.match(switchBody, /contextTokens: this\.contextTokensSetting\(\)/);

  // The host serializes switching behind the same setup-operation guard as
  // installs, and the webview offers Switch only for complete, inactive files.
  assert.match(panelHostSource, /case SETUP_REQUEST_COMMAND\.START_DOWNLOADED_MODEL/);
  assert.match(panelHostSource, /Wait for setup to finish before switching models/);
  assert.match(panelSource, /model\.active \|\| model\.partial/);
  assert.match(panelSource, /data-action="run"/);
  assert.match(panelSource, /Switch/);
  assert.match(panelSource, /command: '\$\{SETUP_REQUEST_COMMAND\.START_DOWNLOADED_MODEL\}', id: model\.id/);

  // A switch spans several runtime status changes, each pushing a STATE that
  // resets setupOperationRunning. The switch flag must outlive those resets
  // (surface keeps saying "starting", buttons stay disabled) and clear only
  // when a STATE arrives with the new model actually running — or on error.
  assert.match(panelSource, /state\.modelSwitchRunning = true;/);
  assert.match(panelSource, /state\.modelSwitchRunning \? 'starting'/);
  assert.match(panelSource, /state\.setupOperationRunning = state\.modelSwitchRunning \|\| state\.cursorConnectRunning;/);
  assert.match(
    panelSource,
    /if \(state\.modelSwitchRunning && message\.runtime && message\.runtime\.running\) \{\s*state\.modelSwitchRunning = false;/
  );
  const errorHandler = panelSource.slice(panelSource.indexOf("SETUP_RESPONSE_TYPE.ERROR}'"));
  assert.match(errorHandler, /state\.modelSwitchRunning = false;/);
});

test("every model start reads the live contextTokens setting, not the frozen record", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");

  const startBody = controllerSource.slice(
    controllerSource.indexOf("private async startInstalledModel"),
    controllerSource.indexOf("private async modelFileSize")
  );
  assert.match(startBody, /contextTokens: this\.contextTokensSetting\(\)/);
  assert.match(startBody, /installed\.contextTokens !== cursorModel\.contextTokens/);

  const configReads = controllerSource.match(/get<number>\("contextTokens", 8192\)/g) ?? [];
  assert.equal(configReads.length, 1);
});

test("Open Cursor Settings targets Cursor's own settings, not the VS Code editor", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");

  // Cursor has two settings surfaces. Add Custom Model lives in Cursor
  // Settings (command cursor.openCursorSettings); workbench.action.openSettings
  // opens the VS Code settings editor, which filtered "Cursor Models" to two
  // unrelated entries. The native command must be tried first, with the VS
  // Code editor only as the non-Cursor fallback.
  const nativeIndex = controllerSource.indexOf('executeCommand("cursor.openCursorSettings")');
  const fallbackIndex = controllerSource.indexOf('executeCommand("workbench.action.openSettings", query)');
  assert.notEqual(nativeIndex, -1);
  assert.notEqual(fallbackIndex, -1);
  assert.equal(nativeIndex < fallbackIndex, true);
  const between = controllerSource.slice(nativeIndex, fallbackIndex);
  assert.match(between, /catch/);
});

test("Cursor setup instructions match Cursor's Add Custom Model flow", async () => {
  const cursorSource = await readText("../out/cursor/cursorIntegration.js");
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");
  assert.match(cursorSource, /Click Add Custom Model/);
  assert.match(cursorSource, /Model name: /);
  assert.match(cursorSource, /Set Model name to /);
  assert.match(cursorSource, /Cursor Settings > Models/);
  assert.equal(cursorSource.includes("Add or enable an OpenAI-compatible model"), false);
  assert.match(panelSource, /Add Custom Model/);
  assert.match(panelSource, /running \? 'on'\s*: busy \? 'starting'/);
});

test("runtime status changes refresh provider and native switch", async () => {
  const extensionSource = await readText("../out/extension.js");
  const runtimeSource = await readText("../out/runtime/llamaServer.js");
  assert.match(extensionSource, /new llamaServer_1\.LlamaServerManager\(output, \(\) =>/);
  assert.match(extensionSource, /provider\.refresh\(\)/);
  assert.match(extensionSource, /refreshStatusBar\(\)/);
  assert.match(runtimeSource, /this\.onStatusChanged\(\)/);
});

test("Connect Cursor command is registered and uses the one-step connection path", async () => {
  const packageJson = await readPackageJson();
  const commands = packageJson.contributes.commands.map((command) => command.command);
  assert.equal(packageJson.activationEvents.includes("onCommand:localMotion.prepareCursor"), true);
  assert.equal(commands.includes("localMotion.prepareCursor"), true);

  const extensionSource = await readText("../out/extension.js");
  const controllerSource = await readText("../out/app/localMotionController.js");
  assert.equal(extensionSource.includes("localMotion.prepareCursor"), true);
  assert.match(extensionSource, /controller\.connectCursor\(\)/);
  assert.match(controllerSource, /async connectCursor\(\)/);
  assert.match(controllerSource, /this\.runtime\.activeSession\(\)/);
  assert.match(controllerSource, /await this\.runtime\.stop\(\)/);
  assert.match(controllerSource, /this\.startInstalledModel\(active/);
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
  // Compiled output keeps the qualified import reference (setupProtocol_1.*)
  // rather than the bare constant name used in the TS source.
  assert.match(panelHtmlSource, /message\.type === '\$\{setupProtocol_1\.SETUP_RESPONSE_TYPE\.INSTALLED\}'/);
  assert.match(panelHtmlSource, /message\.cursor && message\.cursor\.verification/);
  assert.match(panelHtmlSource, /message\.cursor && message\.cursor\.settings/);
});

test("one-click setup downloads Max and Mini before starting Max", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const defaultReposSource = await readText("../src/models/defaultRepos.ts");

  assert.match(defaultReposSource, /Qwen3-Coder-30B-A3B-Instruct-GGUF/);
  assert.match(defaultReposSource, /gemma-4-26B-A4B-it-GGUF/);
  assert.match(controllerSource, /installAndStartAll\(await this\.automagicalCandidates\(\), onProgress, onModelSelected, selectedModelOptionId\)/);
  assert.match(defaultReposSource, /LOCAL_MODEL_PACK/);
  assert.match(defaultReposSource, /label: "Max"/);
  assert.match(defaultReposSource, /modelName: "Qwen3-Coder-30B-A3B"/);
  assert.match(defaultReposSource, /label: "Mini"/);
  assert.match(defaultReposSource, /modelName: "Gemma 4 26B A4B"/);

  const batchBody = controllerSource.slice(
    controllerSource.indexOf("private async installAndStartAll"),
    controllerSource.indexOf("private async installCandidate")
  );
  assert.match(batchBody, /for \(const candidate of candidates\)/);
  assert.match(batchBody, /installedModels\.push\(await this\.installCandidate\(candidate, onProgress, onModelSelected\)\)/);
  assert.match(batchBody, /localModelOptionForRepo\(model\.repoId\)\?\.id === selectedModelOptionId/);
  assert.match(batchBody, /this\.startInstalledModel\(installed/);
});

test("transient model-listing failures retry instead of dead-ending the panel", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");
  const huggingFaceSource = await readText("../src/models/huggingFace.ts");

  // One metadata request with sizes instead of a HEAD probe per GGUF file —
  // fewer requests, fewer transient failures at panel open.
  assert.match(huggingFaceSource, /\?blobs=true/);
  // Auxiliary sidecars (mmproj projectors, MTP heads) never enter selection.
  assert.match(huggingFaceSource, /isAuxiliaryGgufFileName/);

  // A failed candidate load is never cached; the next state request retries.
  assert.match(controllerSource, /candidate instanceof Error/);
  assert.match(controllerSource, /this\.modelOptionCandidates = undefined/);
  // The failure copy names the real cause, not a fake incompatibility verdict.
  assert.match(controllerSource, /Hugging Face returned no model files/);
  assert.match(controllerSource, /quantizations\[0\]\?\.compatibility\.reasons\[0\]/);

  // The unavailable state offers Try Again instead of a disabled dead end.
  assert.match(panelSource, /if \(option\.status === 'unavailable'\) return 'Try Again';/);
  assert.match(panelSource, /option\.status === 'unavailable'\) \{\s*els\.primary\.disabled = true;\s*els\.primary\.textContent = 'Checking…';\s*vscode\.postMessage\(\{ command: '\$\{SETUP_REQUEST_COMMAND\.READY\}' \}\);/);
  assert.equal(panelSource.includes("' Unavailable'"), false);
});

test("installed model state is committed before provider refresh", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const setStateIndex = controllerSource.indexOf("await this.state.setInstalledModel(installed)");
  const refreshIndex = controllerSource.indexOf("this.provider.refresh()", setStateIndex);
  assert.notEqual(setStateIndex, -1);
  assert.notEqual(refreshIndex, -1);
  assert.equal(setStateIndex < refreshIndex, true);
});

test("free memory never blocks a model: advisory at load, honest error from llama-server", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");

  // The pre-download memory gate is gone. A multi-GB download takes a long
  // time and however much RAM happens to be free right now is irrelevant until
  // the model is actually loaded — so it must not block the download.
  assert.equal(controllerSource.includes("assertReadyToStartCandidate"), false);

  // The throwing runtime gate is gone too. macOS "free" memory is elastic
  // (cache eviction, compression), so instantaneous free RAM must never veto
  // a start — a 64GB Mac with many apps open was refusing models it could
  // easily run. The load path warns instead.
  assert.equal(controllerSource.includes("assertCurrentMemoryReady"), false);
  assert.match(controllerSource, /this\.warnIfMemoryTight\(cursorModel\)/);
  const warnBody = controllerSource.slice(
    controllerSource.indexOf("private async warnIfMemoryTight"),
    controllerSource.indexOf("// Every status-bearing response")
  );
  assert.match(warnBody, /showWarningMessage/);
  assert.equal(warnBody.includes("throw"), false);

  // The honest out-of-memory signal is llama-server itself failing to start;
  // that failure is caught and explained with a way out.
  assert.match(controllerSource, /runtime\.start\(cursorModel, llamaServerPath, undefined, cursorTunnelConfigFromWorkspace\(\)\)\.catch/);
  assert.match(controllerSource, /withMemoryHint\(error, cursorModel\.displayName\)/);

  // The download still runs before start; the memory advisory only fires
  // afterwards, inside startInstalledModel.
  const installStart = controllerSource.indexOf("private async installAndStart");
  const installCandidateCall = controllerSource.indexOf("this.installCandidate(candidate", installStart);
  const startIndex = controllerSource.indexOf("this.startInstalledModel(installed", installStart);
  const installCandidateBody = controllerSource.slice(
    controllerSource.indexOf("private async installCandidate"),
    controllerSource.indexOf("private async startInstalledModel")
  );
  const downloadIndex = installCandidateBody.indexOf("this.download(candidate");
  const warnIndex = installCandidateBody.indexOf("this.warnIfMemoryTight");
  assert.notEqual(installCandidateCall, -1);
  assert.notEqual(downloadIndex, -1);
  assert.notEqual(startIndex, -1);
  assert.equal(installCandidateCall < startIndex, true);
  assert.equal(warnIndex, -1);
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

test("Cursor tunnel plumbing stays hidden behind the restored one-step setup card", async () => {
  const packageJson = await readPackageJson();
  const extensionSource = await readText("../src/extension.ts");
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const configSource = await readText("../src/app/cursorTunnelConfig.ts");
  const protocolSource = await readText("../src/setupProtocol.ts");
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");
  const panelHostSource = await readText("../src/ui/setupPanel.ts");
  const properties = packageJson.contributes.configuration.properties;
  // The tunnel is a structural fact of the host app, not a preference: Cursor
  // host => tunnel starts with the model, VS Code host => fully local
  // vscode.lm path. A boolean setting existed briefly and setup silently
  // flipped it — the honest design is no switch at all.
  assert.equal("localMotion.cursorTunnel" in properties, false);
  assert.equal(properties["localMotion.cursorTunnelUrl"].default, "");
  assert.match(properties["localMotion.cursorTunnelUrl"].description, /user-managed tunnel/);
  assert.match(properties["localMotion.cursorTunnelUrl"].description, /instead of spawning a Quick Tunnel/);
  assert.match(properties["localMotion.cursorTunnelUrl"].description, /next model start/);
  assert.match(extensionSource, /new LlamaServerManager\([\s\S]*cursorTunnelConfigFromWorkspace/);
  assert.match(controllerSource, /cursorTunnelConfigFromWorkspace\(\)/);
  assert.match(configSource, /normalizePublicHttpsTunnelUrl/);
  assert.match(configSource, /manual\.url !== undefined/);
  assert.match(configSource, /isCursorHost\(\)/);
  assert.match(configSource, /vscode\.env\.appName\.toLowerCase\(\)\.includes\("cursor"\)/);
  assert.equal(configSource.includes('get<boolean>("cursorTunnel"'), false);

  assert.match(protocolSource, /CONNECT_CURSOR: "connectCursor"/);
  assert.match(panelSource, /id="openCursor"/);
  assert.match(panelSource, /Open Cursor Settings/);
  assert.match(panelSource, /In Cursor: Settings/);
  assert.match(panelSource, /command: '\$\{SETUP_REQUEST_COMMAND\.CONNECT_CURSOR\}'/);
  assert.match(panelHostSource, /case SETUP_REQUEST_COMMAND\.CONNECT_CURSOR/);
  // Setup must never write tunnel state into the user's settings — the old
  // ensureCursorTunnelForCursorSetup silently flipped a global config value.
  assert.equal(controllerSource.includes("ensureCursorTunnelForCursorSetup"), false);
  assert.equal(controllerSource.includes('update("cursorTunnel"'), false);
  assert.equal(panelSource.includes("cursorTunnelEnabledNextStart"), false);
  assert.equal(panelSource.includes("Turn on Cursor tunnel"), false);
  assert.equal(panelSource.includes("Turn the local agent off and on"), false);
  assert.equal(panelSource.includes("If you want Cursor native chat"), false);
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

test("runtime owns the Cursor tunnel next to the proxy and stops it on crashes", async () => {
  const runtimeSource = await readText("../src/runtime/llamaServer.ts");
  const childExitSource = await readText("../src/runtime/runtimeChildExit.ts");
  const tunnelTests = await readText("../tests/cursor-tunnel.test.mjs");
  const typesSource = await readText("../src/types.ts");

  assert.match(runtimeSource, /private tunnel: CloudflaredTunnel \| undefined/);
  assert.match(runtimeSource, /attachRuntimeChildExitHandler\(child/);
  assert.match(childExitSource, /void handlers\.stopTunnel\(\);[\s\S]*?void handlers\.stopProxy\(\);/);
  assert.match(tunnelTests, /runtime child exit cleanup stops the tunnel kill switch/);
  assert.match(runtimeSource, /const tunnelStop = this\.stopTunnel\(\);[\s\S]*?const proxyStop = this\.proxy\?\.stop\(\);/);
  assert.match(runtimeSource, /source: "manual", url: config\.manualUrl/);
  assert.match(runtimeSource, /manualUrlInvalid/);
  assert.match(runtimeSource, /findCloudflared\(\)/);
  assert.match(runtimeSource, /startQuickTunnel/);
  assert.match(runtimeSource, /tunnelDnsResolves/);
  assert.match(runtimeSource, /await tunnel\.stop\(\)/);
  assert.match(runtimeSource, /error: "binary-missing"/);
  // cloudflared is installed on demand like llama.cpp; binary-missing is only
  // reachable when Homebrew is absent or the install fails.
  assert.match(runtimeSource, /await findCloudflared\(\) \?\? await this\.installCloudflared\(\)/);
  assert.match(runtimeSource, /\["install", "cloudflared"\]/);
  // Fresh trycloudflare hostnames can take ~90s to propagate through DNS.
  assert.match(runtimeSource, /TUNNEL_DNS_TIMEOUT_MS = 90_000/);
  assert.match(runtimeSource, /error: "start-timeout"/);
  assert.match(runtimeSource, /error: "exited"/);
  assert.match(runtimeSource, /error: "dns-unresolved"/);
  assert.match(runtimeSource, /error: "invalid-url"/);
  assert.match(typesSource, /source\?: "managed" \| "manual"/);
  assert.match(typesSource, /dns-unresolved/);
  assert.match(typesSource, /invalid-url/);
});

test("setup ON state confirms a real Cursor request without re-nagging", async () => {
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");
  const protocolSource = await readText("../src/setupProtocol.ts");
  const panelHostSource = await readText("../src/ui/setupPanel.ts");
  const controllerSource = await readText("../src/app/localMotionController.ts");

  // The earned, confident line appears only when a real request was observed.
  assert.match(panelSource, /Cursor is using your local model\./);
  assert.match(panelSource, /Cursor can use your local model\./);
  assert.match(panelSource, /runtime\.clientObserved/);
  assert.match(panelSource, /Runs a coding model on this Mac for Cursor\./);
  assert.match(panelSource, /Open Cursor Settings/);
  assert.match(panelSource, /Preparing Cursor setup and opening Cursor Settings\./);
  assert.match(panelSource, /Preparing the Cursor endpoint/);
  assert.match(panelSource, /CONNECT_CURSOR/);
  assert.match(protocolSource, /CONNECT_CURSOR: "connectCursor"/);
  assert.match(panelHostSource, /case SETUP_REQUEST_COMMAND\.CONNECT_CURSOR/);
  assert.match(controllerSource, /status\.cursorTunnel\?\.enabled && !status\.cursorTunnel\.url/);
  assert.match(controllerSource, /await this\.runtime\.stop\(\)/);
  assert.match(controllerSource, /this\.startInstalledModel\(active/);
  assert.equal(panelSource.includes("Connect Cursor"), false);
  assert.equal(panelSource.includes("Copy brew install cloudflared"), false);
  assert.equal(panelSource.includes("Cursor-routed prompts"), false);

  // The permanent one-line disclosure is the entire privacy surface of the
  // Cursor path: the mechanism stays invisible, the consequence does not.
  assert.match(panelSource, /Model runs on this Mac\. Cursor relays chats through its servers\./);

  // Once a real request is observed the connect card is dropped; until then it
  // stays visible. It must not vanish when Cursor Settings opens, so the old
  // freshness-collapse branch is gone entirely.
  assert.match(
    panelSource,
    /if \(inUse\) \{\s*els\.connect\.classList\.add\('hidden'\);\s*\} else \{[\s\S]*?els\.connect\.classList\.remove\('hidden'\)/
  );
  assert.equal(panelSource.includes("current && !handoffFailed"), false);
});

async function readPackageJson() {
  return JSON.parse(await readText("../package.json"));
}

async function readText(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}
