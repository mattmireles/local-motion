import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  automagicalSetupCompletion,
  cursorSetupFreshness,
  cursorSetupValue,
  cursorSetupViewModel,
  isCursorSetupValueKey,
  lastCopiedCursorSetup,
  shouldMarkAutomagicalSetupCompleted,
  shouldPersistCursorSetupCopy
} from "../out/cursor/cursorIntegration.js";
import {
  effectiveMemoryBudget,
  parameterCountFromText,
  quantizationFromFileName,
  selectBestCompatibleQuantization
} from "../out/models/compatibility.js";
import { canReuseInstalledModel } from "../out/models/installedModel.js";
import {
  hasCompletedAutomagicalSetupForInstalledModel,
  shouldOpenSetupOnboarding,
  shouldResumeAutomagicalSetup,
  shouldRunFirstStartupAutomagicalSetup
} from "../out/onboarding.js";
import {
  allowLlamaInstallForAutomagicalStart,
  shouldPostInitialQuantizations
} from "../out/setupPolicy.js";
import {
  isAuthorizedBearer,
  LOCAL_MOTION_API_KEY,
  sanitizeExternalChatRequest,
  sanitizeStop
} from "../out/runtime/openAiChat.js";
import { OpenAiProxy } from "../out/runtime/openAiProxy.js";
import { childFailureMessage } from "../out/runtime/llamaHealth.js";
import { releasePortHolder, reserveLocalhostPort } from "../out/runtime/ports.js";
import { isStartStale, parseContentLengthHeader } from "../out/runtime/runtimeGuards.js";
import { filterForwardHeaders } from "../out/runtime/openAiProxy.js";

test("extracts GGUF quantization names from common filenames", () => {
  assert.equal(quantizationFromFileName("gemma4-coding-Q4_K_M.gguf"), "Q4_K_M");
  assert.equal(quantizationFromFileName("model-IQ3_XS.gguf"), "IQ3_XS");
  assert.equal(quantizationFromFileName("model-f16.gguf"), "F16");
});

test("extracts parameter count from model text", () => {
  assert.equal(parameterCountFromText("gemma-4-12B-coder"), 12);
  assert.equal(parameterCountFromText("Qwen2.5-7.5B-Instruct"), 7.5);
  assert.equal(parameterCountFromText("no-size-here"), undefined);
});

test("uses available memory for compatibility budget", () => {
  assert.equal(
    effectiveMemoryBudget({
      platform: "darwin",
      arch: "arm64",
      cpuBrand: "Apple M2",
      isMac: true,
      isAppleSilicon: true,
      totalMemoryBytes: 32 * 1024 ** 3,
      availableMemoryBytes: 8 * 1024 ** 3,
      recommendedModelMemoryBytes: 24 * 1024 ** 3,
      storageRoot: "/tmp",
      availableDiskBytes: 100 * 1024 ** 3
    }),
    8 * 1024 ** 3
  );
});

test("selects the lowest-memory compatible quantization for automagical setup", () => {
  const base = {
    repoId: "example/model-GGUF",
    revision: "main",
    downloadUrl: "https://example.invalid/model.gguf",
    parameterCount: 7
  };
  const selected = selectBestCompatibleQuantization([
    {
      ...base,
      fileName: "model-Q8_0.gguf",
      quantization: "Q8_0",
      sizeBytes: 8,
      compatibility: { status: "compatible", requiredMemoryBytes: 8, requiredDiskBytes: 8, reasons: [] }
    },
    {
      ...base,
      fileName: "model-Q4_K_M.gguf",
      quantization: "Q4_K_M",
      sizeBytes: 4,
      compatibility: { status: "compatible", requiredMemoryBytes: 4, requiredDiskBytes: 4, reasons: [] }
    },
    {
      ...base,
      fileName: "model-Q2_K.gguf",
      quantization: "Q2_K",
      sizeBytes: 2,
      compatibility: { status: "not-compatible", requiredMemoryBytes: 2, requiredDiskBytes: 2, reasons: ["blocked"] }
    }
  ]);

  assert.equal(selected?.fileName, "model-Q4_K_M.gguf");
});

test("does not select an incompatible quantization for automagical setup", () => {
  const selected = selectBestCompatibleQuantization([
    {
      repoId: "example/model-GGUF",
      fileName: "model-Q2_K.gguf",
      revision: "main",
      quantization: "Q2_K",
      sizeBytes: 2,
      parameterCount: 7,
      downloadUrl: "https://example.invalid/model.gguf",
      compatibility: { status: "not-compatible", requiredMemoryBytes: 2, requiredDiskBytes: 2, reasons: ["blocked"] }
    }
  ]);

  assert.equal(selected, undefined);
});

test("reuses an installed model only when its file is present and size-valid", () => {
  const installed = {
    repoId: "example/model-GGUF",
    fileName: "model-Q4_K_M.gguf",
    revision: "main",
    sizeBytes: 4,
    modelPath: "/tmp/model-Q4_K_M.gguf",
    modelId: "local-motion-example",
    displayName: "Example",
    contextTokens: 8192
  };

  assert.equal(canReuseInstalledModel(installed, 4), true);
  assert.equal(canReuseInstalledModel(installed, 5), false);
  assert.equal(canReuseInstalledModel(installed, undefined), false);
  assert.equal(canReuseInstalledModel(undefined, 4), false);
});

test("sanitizes Cursor-style chat payloads to OpenAI chat completions", () => {
  const request = sanitizeExternalChatRequest(
    {
      model: "",
      messages: [
        { role: "assistant", content: "Ready" },
        { role: "tool", content: [{ type: "text", text: "Use this context" }] }
      ],
      stream: false,
      temperature: 0.7,
      stop: { bad: true },
      unknown_vendor_field: true
    },
    "local-motion-model"
  );

  assert.deepEqual(request, {
    model: "local-motion-model",
    messages: [
      { role: "assistant", content: "Ready" },
      { role: "user", content: "Use this context" }
    ],
    stream: false,
    temperature: 0.7,
    top_p: 0.95,
    max_tokens: 2048,
    stop: undefined
  });
});

test("sanitizes stop sequences from external chat payloads", () => {
  assert.equal(sanitizeStop("END"), "END");
  assert.deepEqual(sanitizeStop(["END", "STOP"]), ["END", "STOP"]);
  assert.equal(sanitizeStop({ bad: true }), undefined);
  assert.equal(sanitizeStop(null), undefined);
});

test("ignores missing content-length headers instead of treating them as zero", () => {
  assert.equal(parseContentLengthHeader(null), undefined);
  assert.equal(parseContentLengthHeader("1024"), 1024);
  assert.equal(parseContentLengthHeader("chunked"), undefined);
});

test("detects stale queued starts after stop increments session generation", () => {
  assert.equal(isStartStale(0, 1), true);
  assert.equal(isStartStale(1, 1), false);
});

test("formats llama-server child failure messages", () => {
  assert.equal(childFailureMessage(1, null), "llama-server failed before becoming healthy: code=1 signal=none");
  assert.equal(childFailureMessage(null, "SIGTERM"), "llama-server failed before becoming healthy: code=none signal=SIGTERM");
});

test("filters hop-by-hop headers from proxy health forwarding", () => {
  const headers = new Headers({
    "content-type": "application/json",
    connection: "keep-alive",
    "transfer-encoding": "chunked"
  });
  assert.deepEqual(filterForwardHeaders(headers), {
    "content-type": "application/json"
  });
});

test("OpenAI proxy uses the preferred Cursor port when it is available", async () => {
  const holder = await reserveLocalhostPort();
  const preferredPort = holder.port;
  await releasePortHolder(holder);

  const proxy = new OpenAiProxy({ upstreamBaseUrl: "http://127.0.0.1:1/v1", modelId: "local-motion-test" });
  try {
    const baseUrl = await proxy.start(preferredPort);
    assert.equal(baseUrl, `http://127.0.0.1:${preferredPort}/v1`);
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${LOCAL_MOTION_API_KEY}` }
    });
    assert.equal(response.status, 200);
  } finally {
    await proxy.stop();
  }
});

test("OpenAI proxy falls back to a dynamic port when the preferred Cursor port is occupied", async () => {
  const holder = await reserveLocalhostPort();
  const proxy = new OpenAiProxy({ upstreamBaseUrl: "http://127.0.0.1:1/v1", modelId: "local-motion-test" });
  try {
    const baseUrl = await proxy.start(holder.port);
    assert.notEqual(baseUrl, `http://127.0.0.1:${holder.port}/v1`);
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${LOCAL_MOTION_API_KEY}` }
    });
    assert.equal(response.status, 200);
  } finally {
    await proxy.stop();
    await releasePortHolder(holder);
  }
});

test("requires the documented local bearer token", () => {
  assert.equal(isAuthorizedBearer(`Bearer ${LOCAL_MOTION_API_KEY}`), true);
  assert.equal(isAuthorizedBearer("Bearer other"), false);
  assert.equal(isAuthorizedBearer(undefined), false);
});

test("Cursor setup view model uses the active runtime endpoint", () => {
  const viewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    modelId: "local-motion-test",
    message: "running"
  });
  assert.equal(viewModel.isRunning, true);
  assert.equal(viewModel.baseUrl, "http://127.0.0.1:50000/v1");
  assert.equal(viewModel.apiKey, LOCAL_MOTION_API_KEY);
  assert.equal(viewModel.modelId, "local-motion-test");
  assert.ok(viewModel.setupBlock.includes("http://127.0.0.1:50000/v1"));
  assert.ok(viewModel.setupBlock.includes("local-motion-test"));
  assert.ok(viewModel.setupBlock.includes(LOCAL_MOTION_API_KEY));
  assert.ok(viewModel.steps.some((line) => line.includes("http://127.0.0.1:50000/v1")));
  assert.equal(cursorSetupValue(viewModel, "baseUrl"), "http://127.0.0.1:50000/v1");
  assert.equal(cursorSetupValue(viewModel, "apiKey"), LOCAL_MOTION_API_KEY);
  assert.equal(cursorSetupValue(viewModel, "modelId"), "local-motion-test");
  assert.equal(cursorSetupValue(viewModel, "setupBlock"), viewModel.setupBlock);
});

test("Cursor setup view model does not invent endpoint values when stopped", () => {
  const viewModel = cursorSetupViewModel({
    running: false,
    message: "No model is running."
  });
  assert.equal(viewModel.isRunning, false);
  assert.equal(viewModel.baseUrl, "");
  assert.equal(viewModel.modelId, "");
  assert.equal(viewModel.apiKey, LOCAL_MOTION_API_KEY);
  assert.equal(viewModel.statusMessage, "No model is running.");
  assert.ok(viewModel.steps.some((line) => line.includes("Start a local model")));
});

test("Cursor setup freshness recognizes unchanged copied endpoint", () => {
  const viewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    modelId: "local-motion-test",
    message: "running"
  });
  const lastCopied = lastCopiedCursorSetup(viewModel, "prepareCursor", "2026-06-16T00:00:00.000Z", "2026-06-16T00:00:00.000Z");
  const freshness = cursorSetupFreshness(viewModel, lastCopied);
  assert.equal(freshness.status, "current");
  assert.equal(freshness.lastCopied, lastCopied);
});

test("Cursor setup freshness distinguishes copied values from verified setup", () => {
  const viewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    modelId: "local-motion-test",
    message: "running"
  });
  const freshness = cursorSetupFreshness(
    viewModel,
    lastCopiedCursorSetup(viewModel, "copySetupBlock", "2026-06-16T00:00:00.000Z")
  );
  assert.equal(freshness.status, "copied");
  assert.ok(freshness.message.includes("not verified"));
});

test("Cursor setup freshness marks changed endpoint stale", () => {
  const oldViewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    modelId: "local-motion-test",
    message: "running"
  });
  const currentViewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50001/v1",
    modelId: "local-motion-test",
    message: "running"
  });
  const freshness = cursorSetupFreshness(
    currentViewModel,
    lastCopiedCursorSetup(oldViewModel, "prepareCursor", "2026-06-16T00:00:00.000Z")
  );
  assert.equal(freshness.status, "stale");
  assert.ok(freshness.message.includes("50000"));
  assert.ok(freshness.message.includes("50001"));
});

test("Cursor setup freshness marks stopped model stale after copied setup values", () => {
  const runningViewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    modelId: "local-motion-test",
    message: "running"
  });
  const stoppedViewModel = cursorSetupViewModel({
    running: false,
    message: "No model is running."
  });
  const freshness = cursorSetupFreshness(
    stoppedViewModel,
    lastCopiedCursorSetup(runningViewModel, "copySetupBlock", "2026-06-16T00:00:00.000Z")
  );
  assert.equal(freshness.status, "stale");
  assert.ok(freshness.message.includes("no Local Motion model is running"));
});

test("last copied Cursor setup records trigger and verification timestamp", () => {
  const viewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    modelId: "local-motion-test",
    message: "running"
  });
  assert.deepEqual(
    lastCopiedCursorSetup(viewModel, "prepareCursor", "2026-06-16T00:00:00.000Z", "2026-06-16T00:00:01.000Z"),
    {
      baseUrl: "http://127.0.0.1:50000/v1",
      modelId: "local-motion-test",
      apiKeyLabel: "local-motion",
      copiedAt: "2026-06-16T00:00:00.000Z",
      trigger: "prepareCursor",
      endpointVerifiedAt: "2026-06-16T00:00:01.000Z"
    }
  );
});

test("automagical setup completion records the verified setup identity", () => {
  const viewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    modelId: "local-motion-test",
    message: "running"
  });
  const copied = lastCopiedCursorSetup(viewModel, "prepareCursor", "2026-06-16T00:00:00.000Z", "2026-06-16T00:00:01.000Z");

  assert.deepEqual(
    automagicalSetupCompletion(copied, "2026-06-16T00:00:02.000Z"),
    {
      baseUrl: "http://127.0.0.1:50000/v1",
      modelId: "local-motion-test",
      apiKeyLabel: "local-motion",
      cursorSetupCopiedAt: "2026-06-16T00:00:00.000Z",
      endpointVerifiedAt: "2026-06-16T00:00:01.000Z",
      completedAt: "2026-06-16T00:00:02.000Z"
    }
  );
});

test("automagical setup completion rejects unverified copied setup", () => {
  const viewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    modelId: "local-motion-test",
    message: "running"
  });

  assert.throws(
    () => automagicalSetupCompletion(lastCopiedCursorSetup(viewModel, "copySetupBlock", "2026-06-16T00:00:00.000Z"), "2026-06-16T00:00:02.000Z"),
    /verified Cursor setup/
  );
});

test("only successful full setup-block copies update last copied Cursor setup", () => {
  assert.equal(shouldPersistCursorSetupCopy("setupBlock", true), true);
  assert.equal(shouldPersistCursorSetupCopy("setupBlock", false), false);
  assert.equal(shouldPersistCursorSetupCopy("baseUrl", true), false);
  assert.equal(shouldPersistCursorSetupCopy("apiKey", true), false);
  assert.equal(shouldPersistCursorSetupCopy("modelId", true), false);
});

test("automagical setup completion requires endpoint, clipboard, and settings success", () => {
  assert.equal(
    shouldMarkAutomagicalSetupCompleted({ endpointVerified: true, setupCopied: true, settingsOpened: true }),
    true
  );
  assert.equal(
    shouldMarkAutomagicalSetupCompleted({ endpointVerified: false, setupCopied: true, settingsOpened: true }),
    false
  );
  assert.equal(
    shouldMarkAutomagicalSetupCompleted({ endpointVerified: true, setupCopied: false, settingsOpened: true }),
    false
  );
  assert.equal(
    shouldMarkAutomagicalSetupCompleted({ endpointVerified: true, setupCopied: true, settingsOpened: false }),
    false
  );
});

test("validates Cursor setup copy keys at runtime", () => {
  assert.equal(isCursorSetupValueKey("apiKey"), true);
  assert.equal(isCursorSetupValueKey("baseUrl"), true);
  assert.equal(isCursorSetupValueKey("modelId"), true);
  assert.equal(isCursorSetupValueKey("setupBlock"), true);
  assert.equal(isCursorSetupValueKey("bad"), false);
  assert.equal(isCursorSetupValueKey(undefined), false);
});

test("automagical dependency install has no second confirmation prompt", async () => {
  const resolverSource = await readFile(new URL("../out/runtime/llamaServerResolver.js", import.meta.url), "utf8");
  assert.equal(resolverSource.includes("showWarningMessage"), false);
  assert.equal(resolverSource.includes("withProgress"), true);
});

test("opens setup onboarding only for first startup without an installed model", () => {
  assert.equal(shouldOpenSetupOnboarding({ enabled: true, alreadyOpened: false, hasInstalledModel: false }), true);
  assert.equal(shouldOpenSetupOnboarding({ enabled: false, alreadyOpened: false, hasInstalledModel: false }), false);
  assert.equal(shouldOpenSetupOnboarding({ enabled: true, alreadyOpened: true, hasInstalledModel: false }), false);
  assert.equal(shouldOpenSetupOnboarding({ enabled: true, alreadyOpened: false, hasInstalledModel: true }), false);
});

test("resumes automagical setup only after a completed setup with an installed model", () => {
  const installed = {
    repoId: "example/model-GGUF",
    fileName: "model-Q4_K_M.gguf",
    revision: "main",
    sizeBytes: 4,
    modelPath: "/tmp/model-Q4_K_M.gguf",
    modelId: "local-motion-test",
    displayName: "Example",
    contextTokens: 8192
  };
  const completion = {
    baseUrl: "http://127.0.0.1:50000/v1",
    modelId: "local-motion-test",
    apiKeyLabel: "local-motion",
    cursorSetupCopiedAt: "2026-06-16T00:00:00.000Z",
    endpointVerifiedAt: "2026-06-16T00:00:01.000Z",
    completedAt: "2026-06-16T00:00:02.000Z"
  };

  assert.equal(hasCompletedAutomagicalSetupForInstalledModel(installed, completion), true);
  assert.equal(
    shouldResumeAutomagicalSetup({ enabled: true, hasCompletedSetupForInstalledModel: true, runtimeRunning: false }),
    true
  );
  assert.equal(
    shouldResumeAutomagicalSetup({ enabled: false, hasCompletedSetupForInstalledModel: true, runtimeRunning: false }),
    false
  );
  assert.equal(
    shouldResumeAutomagicalSetup({ enabled: true, hasCompletedSetupForInstalledModel: false, runtimeRunning: false }),
    false
  );
  assert.equal(
    hasCompletedAutomagicalSetupForInstalledModel(undefined, completion),
    false
  );
  assert.equal(
    hasCompletedAutomagicalSetupForInstalledModel({ ...installed, modelId: "other-model" }, completion),
    false
  );
  assert.equal(
    hasCompletedAutomagicalSetupForInstalledModel(installed, { ...completion, endpointVerifiedAt: "" }),
    false
  );
  assert.equal(
    shouldResumeAutomagicalSetup({ enabled: true, hasCompletedSetupForInstalledModel: true, runtimeRunning: true }),
    false
  );
});

test("runs first startup automagical setup only once before any model is installed", () => {
  assert.equal(
    shouldRunFirstStartupAutomagicalSetup({ enabled: true, alreadyOpened: false, hasInstalledModel: false, runtimeRunning: false }),
    true
  );
  assert.equal(
    shouldRunFirstStartupAutomagicalSetup({ enabled: false, alreadyOpened: false, hasInstalledModel: false, runtimeRunning: false }),
    false
  );
  assert.equal(
    shouldRunFirstStartupAutomagicalSetup({ enabled: true, alreadyOpened: true, hasInstalledModel: false, runtimeRunning: false }),
    false
  );
  assert.equal(
    shouldRunFirstStartupAutomagicalSetup({ enabled: true, alreadyOpened: false, hasInstalledModel: true, runtimeRunning: false }),
    false
  );
  assert.equal(
    shouldRunFirstStartupAutomagicalSetup({ enabled: true, alreadyOpened: false, hasInstalledModel: false, runtimeRunning: true }),
    false
  );
});

test("host-started automagical setup reports errors to the webview", async () => {
  const panelSource = await readFile(new URL("../out/ui/setupPanel.js", import.meta.url), "utf8");
  assert.equal(panelSource.includes("hostStartedAutomagicalSetup"), true);
  assert.equal(panelSource.includes("type: \"error\""), true);
});

test("retry automagical setup command is registered and contributed", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const commands = packageJson.contributes.commands.map((command) => command.command);
  assert.equal(packageJson.activationEvents.includes("onCommand:localMotion.retryAutomagicalSetup"), true);
  assert.equal(commands.includes("localMotion.retryAutomagicalSetup"), true);

  const extensionSource = await readFile(new URL("../out/extension.js", import.meta.url), "utf8");
  assert.equal(extensionSource.includes("localMotion.retryAutomagicalSetup"), true);
});

test("startup resume does not install missing llama dependency", async () => {
  assert.equal(allowLlamaInstallForAutomagicalStart("explicit"), true);
  assert.equal(allowLlamaInstallForAutomagicalStart("startupResume"), false);

  const controllerSource = await readFile(new URL("../out/app/localMotionController.js", import.meta.url), "utf8");
  assert.match(controllerSource, /allowLlamaInstallForAutomagicalStart\)\("explicit"\)/);
  assert.match(controllerSource, /allowLlamaInstallForAutomagicalStart\)\("startupResume"\)/);
});

test("host-started automagical setup hydrates base state before progress", async () => {
  assert.equal(shouldPostInitialQuantizations({ setupOperationActive: false }), true);
  assert.equal(shouldPostInitialQuantizations({ setupOperationActive: true }), false);

  const panelSource = await readFile(new URL("../out/ui/setupPanel.js", import.meta.url), "utf8");
  const panelHtmlSource = await readFile(new URL("../out/ui/setupPanelHtml.js", import.meta.url), "utf8");
  const runtimeStateIndex = panelSource.indexOf("await this.postInitialRuntimeState()");
  const readyIndex = panelSource.indexOf("this.markReady()");
  assert.notEqual(runtimeStateIndex, -1);
  assert.notEqual(readyIndex, -1);
  assert.equal(runtimeStateIndex < readyIndex, true);
  assert.equal(panelSource.includes("shouldPostInitialQuantizations"), true);
  assert.equal(panelSource.includes("setupPanelHtml"), true);
  assert.equal(panelHtmlSource.includes("automagicalSetupRunning"), true);
});

test("startup resume does not prepare Cursor or open the setup panel unless recovery is requested", async () => {
  const extensionSource = await readFile(new URL("../out/extension.js", import.meta.url), "utf8");
  assert.equal(extensionSource.includes("resumeAutomagicalSetupInBackground"), true);
  assert.match(extensionSource, /controller\.resumeAutomagicalRuntime\(\)/);
  assert.equal(extensionSource.includes("controller.resumeAutomagicalSetup()"), false);
  assert.equal(extensionSource.includes("SetupPanel.resumeAutomagicalSetup"), false);
});

test("startup resume setting describes quiet runtime restart", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const description = packageJson.contributes.configuration.properties["localMotion.resumeAutomagicalSetupOnStartup"].description;
  assert.match(description, /restart the installed local model/);
  assert.match(description, /without downloading a new model/);
  assert.match(description, /opening Cursor settings/);
  assert.match(description, /replacing the clipboard/);
  assert.equal(description.includes("prepare Cursor automatically"), false);
});
