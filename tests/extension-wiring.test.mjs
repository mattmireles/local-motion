import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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
});

test("security-sensitive settings are machine scoped", async () => {
  const packageJson = await readPackageJson();
  const properties = packageJson.contributes.configuration.properties;
  for (const key of [
    "localMotion.llamaServerPath",
    "localMotion.cursorTunnelUrl",
    "localMotion.defaultModelRepo",
    "localMotion.maxModelRepo",
    "localMotion.miniModelRepo"
  ]) {
    assert.equal(properties[key].scope, "machine", key);
  }
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
  assert.equal(view?.name, "Local Motion");
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

test("setup first screen is a single on/off switch before Advanced and Setup disclosures", async () => {
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");

  // The live switch and the connect beat appear before Advanced, then Setup.
  const primaryIndex = panelSource.indexOf('id="primary"');
  const connectIndex = panelSource.indexOf('id="connect"');
  const advancedIndex = panelSource.indexOf("<summary>Advanced</summary>");
  const setupIndex = panelSource.indexOf("<summary>Setup</summary>");
  assert.notEqual(primaryIndex, -1);
  assert.notEqual(connectIndex, -1);
  assert.notEqual(advancedIndex, -1);
  assert.notEqual(setupIndex, -1);
  assert.equal(primaryIndex < advancedIndex, true);
  assert.equal(connectIndex < advancedIndex, true);
  assert.equal(advancedIndex < setupIndex, true);

  // The old four-triangle wizard layout is gone. Setup instructions live in
  // their own disclosure below Advanced — always reachable, never buried in
  // the connect card.
  assert.equal(panelSource.includes("Advanced model controls"), false);
  assert.equal(panelSource.includes("Cursor connection details"), false);
  assert.equal(panelSource.includes("Mac and memory details"), false);
  assert.equal(panelSource.includes('class="hero"'), false);
  assert.equal(panelSource.includes("header-actions"), false);
  assert.match(panelSource, /id="setupGuide"/);
  assert.match(panelSource, /setup-guide-steps/);
  assert.match(panelSource, /Turn on a local model in Local Motion/);
  assert.match(panelSource, /Click Connect to Cursor/);
  assert.equal(panelSource.includes("renderSetupGuide"), false);
  assert.equal(panelSource.includes("viewModel.steps"), false);
  assert.equal(panelSource.includes('id="connectSteps"'), false);

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
  // Delete confirms outside the lock, then takes the controller lock for
  // the mutation — the panel holds no gate of its own.
  assert.match(controllerSource, /if \(answer !== "Delete"\) \{\s*return undefined;\s*\}\s*\n\s*return this\.withSetupOperation/);
  // Regression (2026-07-02 external audit): the modal wait is unbounded, so
  // a switch or stop can land while it sits open. The mutation must re-read
  // the model inside the lock and act on the fresh `current.active`, never
  // the pre-modal snapshot.
  const deleteBody = controllerSource.slice(
    controllerSource.indexOf("async deleteDownloadedModel"),
    controllerSource.indexOf("async connectCursor(")
  );
  const lockedDeleteBody = deleteBody.slice(deleteBody.indexOf("return this.withSetupOperation"));
  assert.match(lockedDeleteBody, /const current = \(await this\.downloadedModels\(\)\)\.models\.find/);
  assert.equal(lockedDeleteBody.includes("model.active"), false);
  assert.match(lockedDeleteBody, /if \(current\.active\)/);

  // Regression (2026-07-02 external audit rounds 2 and 7): the restart
  // decision after replace's multi-GB download is intent at click plus an
  // intact stop epoch — a bare "is it running" snapshot either reversed an
  // explicit mid-download Turn Off (round 2) or let an old-model crash
  // silently cancel the replacement the user asked for (round 7).
  assert.equal(controllerSource.includes("wasActive"), false);
  const replaceBody = controllerSource.slice(
    controllerSource.indexOf("private async replaceModelOptionLocked"),
    controllerSource.indexOf("async startDownloadedModel")
  );
  assert.match(replaceBody, /const previousActive = Boolean\(previous && this\.isActiveInstalledModel\(previous\)\)/);
  assert.match(replaceBody, /if \(previousActive && this\.runtime\.stopEpoch\(\) === stopEpoch\)/);
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
  // The card leads with the consequence a user plans around — the context
  // window — not internal memory accounting.
  assert.match(panelSource, /option\.contextWindow \+ ' context'/);
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
  // reuses the normal start path, which stops the previous server, fits the
  // context, and persists the switched model so restarts pick it.
  assert.match(controllerSource, /async startDownloadedModel\(id: string\)/);
  assert.match(controllerSource, /resolveDownloadedModelId\(this\.modelsRoot\(\), id\)/);
  assert.match(controllerSource, /That download is incomplete/);
  const switchStart = controllerSource.indexOf("async startDownloadedModel");
  const switchEnd = controllerSource.indexOf("async deleteDownloadedModel", switchStart);
  const switchBody = controllerSource.slice(switchStart, switchEnd);
  assert.match(switchBody, /this\.startInstalledModel\(installed/);
  assert.match(switchBody, /const slottedModel = this\.localModelPack\(\)/);
  assert.match(switchBody, /this\.state\.modelSlot\(option\.id\)/);
  assert.match(switchBody, /path\.resolve\(slot\.modelPath\) === path\.resolve\(modelPath\)/);
  assert.match(switchBody, /\.\.\.slottedModel/);
  assert.match(switchBody, /modelId: LOCAL_MOTION_MODEL_ID/);
  // Persistence is owned by startInstalledModel; the switch path must not
  // add a second, pre-fit write on top of it.
  assert.equal(switchBody.includes("setInstalledModel"), false);

  // The host serializes switching behind the same setup-operation guard as
  // installs, and the webview offers Switch only for complete, inactive files.
  assert.match(panelHostSource, /case SETUP_REQUEST_COMMAND\.START_DOWNLOADED_MODEL/);
  assert.match(panelSource, /model\.active \|\| model\.partial/);
  assert.match(panelSource, /data-action="run"/);
  assert.match(panelSource, /Switch/);
  assert.match(panelSource, /command: '\$\{SETUP_REQUEST_COMMAND\.START_DOWNLOADED_MODEL\}', id: model\.id/);

  // A switch spans several runtime status changes, each pushing a STATE that
  // resets setupOperationRunning. The switch flag must outlive those resets
  // and clear on STATE-with-running only for downloaded-model switches
  // (where the old server stops before the new one loads, so "running"
  // means the new model). An install-backed switch keeps the OLD model
  // running through the download — there, only AUTOMAGICAL_SETUP_COMPLETE
  // ends the switch, or a mid-download status refresh would snap the panel
  // to "on" and hide the progress (2026-07-02 external audit round 6).
  assert.match(panelSource, /state\.modelSwitchRunning = true;/);
  assert.match(panelSource, /state\.modelSwitchRunning \? 'starting'/);
  assert.match(panelSource, /state\.setupOperationRunning = state\.modelSwitchRunning \|\| state\.cursorConnectRunning \|\| message\.setupBusy === true;/);
  assert.match(
    panelSource,
    /if \(state\.modelSwitchRunning && !state\.automagicalSetupRunning && message\.runtime && message\.runtime\.running\) \{\s*state\.modelSwitchRunning = false;/
  );
  const errorHandler = panelSource.slice(panelSource.indexOf("SETUP_RESPONSE_TYPE.ERROR}'"));
  assert.match(errorHandler, /state\.modelSwitchRunning = false;/);
});

test("the runtime owns the context fit; no start path can pass the raw setting to -c", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const llamaSource = await readText("../src/runtime/llamaServer.ts");
  const providerSource = await readText("../src/provider/localMotionProvider.ts");
  const manifest = JSON.parse(await readText("../package.json"));

  // The fit happens where -c is written, so the setup panel, model switch,
  // and Connect Cursor restart all get it by construction — there is no
  // second fit site to drift from.
  assert.match(llamaSource, /fitContextTokens\(sizeBytes, modelMemoryBudgetBytes\(\)/);
  assert.match(llamaSource, /String\(contextTokens\)/);
  assert.equal(llamaSource.includes("String(model.contextTokens)"), false);

  // The setting is a clamped ceiling read in exactly one place — anywhere
  // in src/, not just the files this test happens to know about — so a
  // hand-edited settings.json 0 or -5 can never reach llama-server.
  assert.match(llamaSource, /Math\.min\(131072, Math\.max\(2048, Math\.floor\(raw\)\)\)/);
  const sourceFiles = (await readdir(new URL("../src", import.meta.url), { recursive: true }))
    .filter((name) => name.endsWith(".ts"));
  const allSource = (await Promise.all(sourceFiles.map((name) => readText(`../src/${name}`)))).join("\n");
  const configReads = allSource.match(/get<number>\("contextTokens"/g) ?? [];
  assert.equal(configReads.length, 1);
  assert.equal(manifest.contributes.configuration.properties["localMotion.contextTokens"].default, 131072);
  assert.match(llamaSource, /get<number>\("contextTokens", 131072\)/);

  // What runs is what persists: the session carries the fitted value and
  // startInstalledModel writes exactly that record (explicit picks keep the
  // session bearer key out of globalState).
  const startBody = controllerSource.slice(
    controllerSource.indexOf("private async startInstalledModel"),
    controllerSource.indexOf("private async modelFileSize")
  );
  assert.match(startBody, /contextTokens: session\.contextTokens/);
  assert.equal(startBody.includes("apiKey"), false);
  // The controller's only fit use is the display-only card helper; the
  // start path never computes a context of its own.
  assert.equal(startBody.includes("fitContextTokens"), false);
  assert.match(controllerSource, /private diskFit\(sizeBytes: number\)/);

  // The provider advertises what one llama-server slot can actually hold:
  // the running session's -c (not a possibly stale record) divided across
  // --parallel slots, minus the output reservation that shares the slot.
  assert.match(providerSource, /active\?\.contextTokens \?\? model\.contextTokens/);
  assert.match(providerSource, /active\?\.parallelRequests \?\? parallelRequestsSetting\(\)/);
  assert.match(providerSource, /maxInputTokens: Math\.max\(1024, slotTokens - maxOutputTokens\)/);

  // 128k on a 64GB Mac is a product requirement: q8_0 KV cache (with flash
  // attention pinned on, required for V-quant) halves context memory, and
  // one parallel slot gives a single request the full window.
  assert.match(llamaSource, /"-fa", "on", "-ctk", "q8_0", "-ctv", "q8_0"/);
  assert.equal(manifest.contributes.configuration.properties["localMotion.parallelRequests"].default, 1);
  assert.match(llamaSource, /get<number>\("parallelRequests", 1\)/);

  // Pre-Aug-2025 llama-server builds die on the value-taking -fa form, and
  // some models lack flash-attention support; both exit before health and
  // get exactly one retry on plain f16 KV, with upgrade guidance logged.
  // Slow-load health timeouts must NOT retry.
  assert.match(llamaSource, /error\.message\.startsWith\("llama-server failed"\)/);
  assert.match(llamaSource, /spawnAndAwaitHealth\(baseArgs\)/);
  assert.match(llamaSource, /brew upgrade llama\.cpp/);

  // Installs stamp the candidate's fitted value as the provisional record.
  assert.match(controllerSource, /contextTokens: candidate\.compatibility\.fittedContextTokens/);
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
  assert.match(cursorSource, /Add Custom Model/);
  assert.match(cursorSource, /Model name: /);
  assert.match(cursorSource, /select that custom model in chat/);
  assert.match(cursorSource, /Model name is not valid/);
  assert.match(cursorSource, /Connect to Cursor/);
  assert.equal(cursorSource.includes("select Local Motion from Cursor's model picker"), false);
  assert.equal(cursorSource.includes("Add or enable an OpenAI-compatible model"), false);
  assert.match(panelSource, /Connect to Cursor/);
  assert.match(panelSource, /connectPending/);
  assert.match(panelSource, /connectReady/);
  assert.match(panelSource, /setupGuide/);
  assert.match(panelSource, /setup-guide-steps/);
  assert.equal(panelSource.includes("renderSetupGuide"), false);
  assert.equal(panelSource.includes("viewModel.steps"), false);
  assert.match(panelSource, /LOCAL_MOTION_MODEL_ID/);
  assert.match(panelSource, /running \? 'on'\s*: state\.cursorConnectRunning \? 'starting'/);
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
  assert.match(controllerSource, /this\.startInstalledModel\(active/);
  assert.match(controllerSource, /prepareCursorAfterStartingInstalledModel/);
  assert.match(controllerSource, /this\.reusableInstalledModel\(\)/);
  assert.match(controllerSource, /allowLlamaInstallForAutomagicalStart\)\("explicit"\)/);
  assert.match(controllerSource, /return this\.cursorSetup\.prepareCursorAndMarkCompleted\(\)/);
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

test("the Advanced manual install surface stays deleted; model cards are the only install path", async () => {
  // The Advanced repo box duplicated the per-card Replace flow, and its
  // initial-quantizations path had already been hardwired off. Guard the
  // deletion end to end so no dead protocol command or handler creeps back.
  const protocolSource = await readText("../src/setupProtocol.ts");
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const panelHostSource = await readText("../src/ui/setupPanel.ts");
  const panelHtmlSource = await readText("../out/ui/setupPanelHtml.js");

  assert.equal(protocolSource.includes("INSTALL_RUN"), false);
  assert.equal(protocolSource.includes("SEARCH_RESULTS"), false);
  assert.equal(protocolSource.includes("QUANTIZATIONS"), false);
  assert.equal(controllerSource.includes("installRunLocked"), false);
  assert.equal(controllerSource.includes("searchModels"), false);
  assert.equal(panelHostSource.includes("INSTALL_RUN"), false);
  assert.equal(panelHtmlSource.includes("Install and Turn On"), false);
  assert.equal(panelHtmlSource.includes("renderQuantizations"), false);

  // The INSTALLED response died with its only producer (manual install);
  // the optional Cursor payload lives on through automagical completion,
  // and the webview still consumes it there.
  assert.equal(protocolSource.includes("INSTALLED"), false);
  assert.equal(panelHtmlSource.includes("SETUP_RESPONSE_TYPE.INSTALLED}"), false);
  assert.match(protocolSource, /cursor\?: CursorSetupPreparedResponse/);
  assert.match(panelHtmlSource, /message\.cursor && message\.cursor\.verification/);
  assert.match(panelHtmlSource, /message\.cursor && message\.cursor\.settings/);
});

test("one-click setup downloads Max and Mini before starting Max", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const defaultReposSource = await readText("../src/models/defaultRepos.ts");

  assert.match(defaultReposSource, /Qwen3-Coder-30B-A3B-Instruct-GGUF/);
  assert.match(defaultReposSource, /gemma-4-26B-A4B-it-GGUF/);
  assert.match(controllerSource, /installAndStartAll\(await this\.automagicalCandidates\(intent\.quantizationChoice\), onProgress, onModelSelected, selectedModelOptionId, intent\.stopEpoch\)/);
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
  const compatibilitySource = await readText("../src/models/compatibility.ts");
  assert.match(compatibilitySource, /quantizations\[0\]\?\.compatibility\.reasons\[0\]/);

  // The unavailable state offers Try Again instead of a disabled dead end.
  assert.match(panelSource, /if \(option\.status === 'unavailable'\) return 'Try Again';/);
  assert.match(panelSource, /option\.status === 'unavailable'\) \{\s*els\.primary\.disabled = true;\s*els\.primary\.textContent = 'Checking…';\s*vscode\.postMessage\(\{ command: '\$\{SETUP_REQUEST_COMMAND\.READY\}' \}\);/);
  assert.equal(panelSource.includes("' Unavailable'"), false);
});

test("model cards show the fitted context window and offer a quantization chooser", async () => {
  const protocolSource = await readText("../src/setupProtocol.ts");
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const panelSource = await readText("../src/ui/setupPanelHtml.ts");
  const panelHostSource = await readText("../src/ui/setupPanel.ts");
  const stylesSource = await readText("../src/ui/setupPanelStyles.ts");

  // Protocol: the chooser is a first-class command with preformatted,
  // consequence-labeled entries (the webview never computes memory math).
  assert.match(protocolSource, /SELECT_QUANTIZATION: "selectQuantization"/);
  assert.match(protocolSource, /SetupQuantizationChoiceView/);
  assert.match(protocolSource, /contextWindow\?: string/);

  // The decision logic is pure and behaviorally tested in compatibility.ts;
  // the controller only threads the stored choice through, and only entries
  // the chooser actually offers are selectable (one eligibility predicate
  // covers rendering and selection — no hidden sub-Q4/Unknown reachable).
  const compatibilitySource = await readText("../src/models/compatibility.ts");
  assert.match(compatibilitySource, /export function chooseOptionCandidate/);
  assert.match(compatibilitySource, /export function chooserQuantizations/);
  assert.match(compatibilitySource, /export function isChooserEligibleQuantization/);
  // The stored choice flows through a snapshot parameter so an in-flight
  // install cannot be retargeted by a choice posted mid-listing.
  assert.match(controllerSource, /chosen: ReadonlyMap<LocalModelOptionId, string> = this\.quantizationChoice/);
  assert.match(controllerSource, /chooseOptionCandidate\(quantizations, chosen\.get\(optionId\)\)/);
  assert.match(controllerSource, /quantizationChoice: new Map\(this\.quantizationChoice\)/);
  assert.match(controllerSource, /chooserQuantizations\(quantizations\)\.some\(\(candidate\) => candidate\.fileName === fileName\)/);
  assert.match(controllerSource, /That quantization is not available for this model\./);
  assert.match(controllerSource, /formatTokenWindow\(candidate\.compatibility\.fittedContextTokens\)/);

  // Once a file is on disk, the card reports THAT file, never the listing's
  // best candidate — a downloaded Q4 must not masquerade as "Q8 · 128k".
  assert.match(controllerSource, /quantization: quantizationFromFileName\(downloaded\.fileName\)/);
  assert.match(controllerSource, /downloadSize: formatBytes\(downloaded\.sizeBytes\)/);
  assert.match(controllerSource, /\.\.\.this\.diskFit\(downloaded\.sizeBytes\)/);

  // Every card states its runtime memory against this Mac's budget — the
  // fact the user decides by — derived from the same formula the spawn
  // uses, for listing candidates and on-disk files alike.
  assert.match(compatibilitySource, /export function fitRequiredMemoryBytes/);
  assert.match(controllerSource, /formatBytes\(fitRequiredMemoryBytes\(sizeBytes, isAppleSiliconHost\(\), fitted\)\)/);
  assert.match(panelSource, /'uses ' \+ option\.requiredMemory \+ \(budget \? ' of ' \+ budget : ''\)/);

  // Selection is a visible radio on the card itself, Replace hides behind
  // an icon toggle, and no card fact is stated twice: quantization and
  // download size live in the chooser when one renders, and the summary
  // and "Not installed" echoes are deleted outright.
  assert.match(panelSource, /class="model-radio" aria-hidden="true"/);
  assert.match(stylesSource, /\.model-option\.selected \.model-radio::after/);
  // Selection accent derives from the button color; focusBorder is a
  // keyboard-ring token many themes tune near-invisible.
  assert.match(stylesSource, /--accent: var\(--vscode-button-background, var\(--vscode-focusBorder\)\)/);
  assert.match(panelSource, /data-replace-toggle/);
  assert.match(panelSource, /state\.replaceOpen\[optionId\] = !state\.replaceOpen\[optionId\]/);
  assert.match(panelSource, /choices \? '' : option\.quantization/);
  assert.equal(panelSource.includes("option.summary"), false);
  assert.equal(controllerSource.includes('"Not installed"'), false);
  assert.match(controllerSource, /statusText: unavailableReason \?\? ""/);

  // Disk facts need no network: a fully-downloaded setup renders without
  // awaiting the Hugging Face listing, so an offline Mac with both models
  // on disk gets an instant panel instead of a 30s listing-timeout stall.
  assert.match(controllerSource, /optionStates\.every\(\(state\) => state\.downloaded\)\s*\?\s*new Map/);
  const payloadBody = controllerSource.slice(
    controllerSource.indexOf("private async modelOptionsPayload"),
    controllerSource.indexOf("private slottedOptionId")
  );
  assert.equal(payloadBody.indexOf("if (downloaded)") < payloadBody.indexOf("candidates.get(option.id)"), true);


  // Card copy states the consequence, and the chooser only renders while
  // there is a real choice to make (pre-download, more than one level).
  assert.match(panelSource, /option\.contextWindow \+ ' context'/);
  assert.match(panelSource, /option\.quantizationChoices\.length > 1/);
  assert.match(panelSource, /select data-quant-option/);
  assert.match(panelSource, /command: '\$\{SETUP_REQUEST_COMMAND\.SELECT_QUANTIZATION\}'/);
  // Interacting with the chooser must not toggle the card's radio state.
  assert.match(panelSource, /closest\('select'\)/);

  // Host handles the command; styles keep the select on the same quiet
  // input treatment as the replace field.
  assert.match(panelHostSource, /case SETUP_REQUEST_COMMAND\.SELECT_QUANTIZATION/);
  assert.match(panelHostSource, /this\.controller\.selectQuantization\(message\.modelOptionId, message\.fileName\)/);
  assert.match(stylesSource, /\.model-quant select/);
});

test("installed model state is committed before provider refresh", async () => {
  const controllerSource = await readText("../src/app/localMotionController.ts");
  const startBody = controllerSource.slice(
    controllerSource.indexOf("private async startInstalledModel"),
    controllerSource.indexOf("private async modelFileSize")
  );
  const setStateIndex = startBody.indexOf("await this.state.setInstalledModel({");
  const refreshIndex = startBody.indexOf("this.provider.refresh()", setStateIndex);
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
  // easily run.
  assert.equal(controllerSource.includes("assertCurrentMemoryReady"), false);

  // The "Memory is tight" advisory is gone as well: fitted contexts saturate
  // the budget by design, so required-vs-free would have warned on nearly
  // every large-model start — cry-wolf noise, and its own doc admitted free
  // memory predicts nothing on macOS.
  assert.equal(controllerSource.includes("warnIfMemoryTight"), false);
  assert.equal(controllerSource.includes("Memory is tight"), false);

  // The honest out-of-memory signal is llama-server itself failing to start;
  // that failure is caught and explained with a way out.
  assert.match(controllerSource, /const tunnelConfig = options\.connectCursor \? cursorTunnelConfigFromWorkspace\(\{ forceCursor: true \}\) : undefined/);
  // The resolver rides into runtime.start as a thunk: a healthy reconnect
  // (reuse) never pays a PATH probe or brew install, and resolution runs
  // inside the serialized start behind the staleness checkpoints.
  assert.match(controllerSource, /\(\) => this\.resolver\.resolve\(\{ allowInstall: options\.allowInstall \}\)/);
  const llamaStartBody = (await readText("../src/runtime/llamaServer.ts"));
  const reuseIdx = llamaStartBody.indexOf("if (this.session?.modelPath === model.modelPath");
  const resolveIdx = llamaStartBody.indexOf("typeof llamaServerPath === \"function\" ? await llamaServerPath()");
  assert.notEqual(reuseIdx, -1);
  assert.notEqual(resolveIdx, -1);
  assert.equal(reuseIdx < resolveIdx, true);
  assert.match(controllerSource, /withMemoryHint\(error, installed\.displayName\)/);

  // The download still runs before start.
  const installStart = controllerSource.indexOf("private async installAndStart");
  const installCandidateCall = controllerSource.indexOf("this.installCandidate(candidate", installStart);
  const startIndex = controllerSource.indexOf("this.startInstalledModel(installed", installStart);
  const installCandidateBody = controllerSource.slice(
    controllerSource.indexOf("private async installCandidate"),
    controllerSource.indexOf("private async startInstalledModel")
  );
  const downloadIndex = installCandidateBody.indexOf("this.download(candidate");
  assert.notEqual(installCandidateCall, -1);
  assert.notEqual(downloadIndex, -1);
  assert.notEqual(startIndex, -1);
  assert.equal(installCandidateCall < startIndex, true);
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

test("command palette messages do not claim Cursor is connected before a real request", async () => {
  const extensionSource = await readText("../src/extension.ts");
  const cursorSource = await readText("../src/cursor/cursorIntegration.ts");
  const diagnosticsSource = await readText("../src/diagnostics/setupDiagnostics.ts");
  assert.equal(extensionSource.includes("Local Motion is connected"), false);
  assert.match(extensionSource, /local agent is on/);
  assert.match(extensionSource, /Cursor setup is ready/);
  assert.match(cursorSource, /CURSOR_CUSTOM_MODEL_HANDOFF_HINT/);
  assert.match(cursorSource, /select that custom model in chat \(not Auto\)/);
  assert.match(extensionSource, /CURSOR_CUSTOM_MODEL_HANDOFF_HINT/);
  assert.match(diagnosticsSource, /CURSOR_CUSTOM_MODEL_HANDOFF_HINT/);
  assert.equal(extensionSource.includes("if Local Motion is not listed"), false);
});

test("downloads single-flight by target GGUF path", async () => {
  const downloaderSource = await readText("../src/runtime/downloader.ts");
  assert.match(downloaderSource, /const inFlightDownloads = new Map<string, Promise<string>>\(\)/);
  assert.match(downloaderSource, /inFlightDownloads\.get\(targetPath\)/);
  assert.match(downloaderSource, /inFlightDownloads\.set\(targetPath, download\)/);
  assert.match(downloaderSource, /inFlightDownloads\.delete\(targetPath\)/);
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
  // The tunnel is not part of local model start. It exists only for the
  // explicit Cursor handoff, and remains hidden from the main setup path.
  assert.equal("localMotion.cursorTunnel" in properties, false);
  assert.equal(properties["localMotion.cursorTunnelUrl"].default, "");
  assert.match(properties["localMotion.cursorTunnelUrl"].description, /user-managed tunnel/);
  assert.match(properties["localMotion.cursorTunnelUrl"].description, /when you connect Cursor/);
  assert.equal(extensionSource.includes("cursorTunnelConfigFromWorkspace"), false);
  assert.match(controllerSource, /cursorTunnelConfigFromWorkspace\(\{ forceCursor: true \}\)/);
  assert.match(configSource, /normalizePublicHttpsTunnelUrl/);
  assert.match(configSource, /manual\.url !== undefined/);
  assert.match(configSource, /forceCursor/);
  assert.equal(configSource.includes("isCursorHost"), false);
  assert.equal(configSource.includes("vscode.env.appName"), false);
  assert.equal(configSource.includes('get<boolean>("cursorTunnel"'), false);

  assert.match(protocolSource, /CONNECT_CURSOR: "connectCursor"/);
  assert.match(panelSource, /id="openCursor"/);
  assert.match(panelSource, /Connect to Cursor/);
  assert.match(panelSource, /id="connectPending"/);
  assert.match(panelSource, /id="connectReady"/);
  assert.match(panelSource, /id="setupGuide"/);
  assert.match(panelSource, /setup-guide-steps/);
  assert.equal(panelSource.includes("renderSetupGuide"), false);
  assert.match(panelSource, /data-key="setupBlock"/);
  assert.match(panelSource, /Copy Updated Setup/);
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
  assert.match(runtimeSource, /probeManagedQuickTunnels/);
  assert.match(runtimeSource, /error: "binary-missing"/);
  // cloudflared is installed on demand like llama.cpp; binary-missing is only
  // reachable when Homebrew is absent or the install fails.
  assert.match(runtimeSource, /await findCloudflared\(\) \?\? await this\.installCloudflared\(abortSignal\)/);
  assert.match(runtimeSource, /\["install", "cloudflared"\]/);
  // Quick Tunnel readiness uses DoH + SNI HTTPS (not dig/dns.lookup): some
  // home routers NXDOMAIN fresh trycloudflare names while Cloudflare DoH
  // already has the A record. Retry with a fresh hostname when one stalls.
  assert.match(runtimeSource, /from "\.\/tunnelReachability"/);
  assert.match(await readText("../src/runtime/tunnelReachability.ts"), /TUNNEL_REACHABILITY_TIMEOUT_MS/);
  assert.match(await readText("../src/runtime/tunnelReachability.ts"), /tunnelHttpReachable/);
  assert.match(await readText("../src/runtime/tunnelReachability.ts"), /cloudflare-dns\.com\/dns-query/);
  assert.match(await readText("../src/runtime/tunnelReachability.ts"), /servername: hostname/);
  assert.match(await readText("../src/runtime/tunnelReachability.ts"), /cachedIp/);
  assert.match(await readText("../src/runtime/tunnelReachability.ts"), /export async function probeManagedQuickTunnels/);
  assert.match(await readText("../tests/cursor-tunnel.test.mjs"), /retries a fresh hostname when cloudflared exits mid-probe/);
  assert.match(runtimeSource, /error: "start-timeout"/);
  assert.match(runtimeSource, /error: "exited"/);
  assert.match(await readText("../src/runtime/tunnelReachability.ts"), /error: "dns-unresolved"/);
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
  // Until then: one Connect action when not ready; copy fields only when ready.
  assert.match(panelSource, /Cursor is using your local model\./);
  assert.match(panelSource, /One more step to use this model in Cursor chat\./);
  assert.match(panelSource, /Copy these values into Cursor Settings/);
  assert.match(panelSource, /connectPending/);
  assert.match(panelSource, /connectReady/);
  assert.match(panelSource, /Connect to Cursor/);
  assert.match(panelSource, /viewModel\.isRunning === true/);
  assert.match(panelSource, /runtime\.clientObserved/);
  assert.match(panelSource, /Runs a coding model on this Mac for Cursor\./);
  assert.match(panelSource, /CONNECT_CURSOR/);
  assert.match(protocolSource, /CONNECT_CURSOR: "connectCursor"/);
  assert.match(panelHostSource, /case SETUP_REQUEST_COMMAND\.CONNECT_CURSOR/);
  // The runtime is the single tunnel authority: connectCursor routes every
  // running session through the locked start and never inspects tunnel
  // health itself — deciding that in two places let a leftover quick-tunnel
  // URL mask a newly configured manual one.
  {
    const connectSlice = controllerSource.slice(
      controllerSource.indexOf("async connectCursor("),
      controllerSource.indexOf("private async prepareCursorAfterStartingInstalledModel")
    );
    // No tunnel-STATE reads (status/session) — the runtime owns those.
    // Config pre-flight (cursorTunnelConfigFromWorkspace) is allowed: an
    // invalid manual URL is a settings error rejected before any respawn.
    assert.equal(connectSlice.includes("status.cursorTunnel"), false);
    assert.equal(connectSlice.includes("cursorTunnel?.url"), false);
    assert.match(connectSlice, /cursorTunnelConfigFromWorkspace\(\{ forceCursor: true \}\)\.manualUrlInvalid/);
    assert.match(connectSlice, /this\.startInstalledModel\(active/);
    assert.match(connectSlice, /connectCursor: true/);
  }
  assert.equal(panelSource.includes("Copy brew install cloudflared"), false);
  assert.equal(panelSource.includes("Cursor-routed prompts"), false);
  assert.match(panelSource, /viewModel\.isRunning === true/);
  assert.match(panelSource, /renderConnectingCard/);
  assert.match(panelSource, /els\.openCursor\.textContent = 'Connecting…'/);
  assert.equal(panelSource.includes("viewModel.baseUrl || viewModel.statusMessage"), false);
  assert.equal(panelSource.includes("Unavailable until Cursor connection is ready"), false);

  // The permanent one-line disclosure is the entire privacy surface of the
  // Cursor path: the mechanism stays invisible, the consequence does not.
  assert.match(panelSource, /Model runs on this Mac\. Cursor relays chats through its servers\./);

  // Once a real request is observed the connect card is dropped; until then it
  // stays visible. Not-ready shows connectPending only; ready shows values.
  assert.match(
    panelSource,
    /if \(inUse\) \{[\s\S]*?els\.connect\.classList\.add\('hidden'\);[\s\S]*?\} else \{[\s\S]*?els\.connect\.classList\.remove\('hidden'\)/
  );
  assert.match(panelSource, /renderConnectingCard/);
  assert.match(panelSource, /Connecting to Cursor/);
  assert.equal(panelSource.includes("current && !handoffFailed"), false);
});

async function readPackageJson() {
  return JSON.parse(await readText("../package.json"));
}

async function readText(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}
