import assert from "node:assert/strict";
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
import { CursorSetupWorkflow } from "../out/cursor/cursorSetupWorkflow.js";
import { normalizePublicHttpsTunnelUrl } from "../out/cursor/tunnelUrl.js";
import { setupDiagnosticSummary } from "../out/diagnostics/setupDiagnostics.js";
import {
  classifyCompatibility,
  effectiveMemoryBudget,
  isShardedGgufFileName,
  meetsAutomagicalQualityFloor,
  parameterCountFromText,
  quantizationFromFileName,
  selectBestCompatibleQuantization
} from "../out/models/compatibility.js";
import { profileMachine } from "../out/system/machineProfile.js";
import * as http from "node:http";
import * as os from "node:os";
import {
  AUTOMAGICAL_MODEL_REPOS,
  DEFAULT_MODEL_REPO,
  automagicalModelRepos,
  normalizeHuggingFaceRepoId
} from "../out/models/defaultRepos.js";
import { canReuseInstalledModel, canReuseInstalledModelForDefault } from "../out/models/installedModel.js";
import { NO_INSTALLED_MODEL_MESSAGE } from "../out/provider/providerMessages.js";
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
  isAutomagicalSetupCompletion,
  isLastCopiedCursorSetup
} from "../out/stateValidation.js";
import {
  generateApiKey,
  isAuthorizedBearer,
  sanitizeExternalChatRequest,
  sanitizeStop
} from "../out/runtime/openAiChat.js";
import { OpenAiProxy } from "../out/runtime/openAiProxy.js";
import { childFailureMessage } from "../out/runtime/llamaHealth.js";
import { LOCAL_MOTION_MODEL_ID } from "../out/types.js";
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

test("uses stable model budget for compatibility selection", () => {
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
    24 * 1024 ** 3
  );
});

test("model memory budget tracks the Metal wired limit at 80% of total RAM", async () => {
  // The binding constraint for GPU-wired GGUF weights on Apple Silicon is
  // Metal's recommendedMaxWorkingSetSize (measured 81% of RAM on a 64GB
  // M2 Ultra), not free memory. The budget must sit just under it — the old
  // 0.72 was unexplained conservatism that blocked models the machine runs.
  const machine = await profileMachine(os.tmpdir());
  assert.equal(machine.recommendedModelMemoryBytes, Math.floor(os.totalmem() * 0.8));
});

test("a 64GB Mac fits a 70B-class 4-bit model at moderate context", () => {
  // Regression for the over-conservative gates: a 42.5GB 70B Q4_K_M file
  // was classified as needing ~62GB (1.32x multiplier double-counting
  // overheads) against a 46GB budget (0.72 of RAM). Honest math: ~1.1x the
  // mmap'd file plus explicit KV-cache and server overheads, inside an 80%
  // wired-limit budget.
  const GIB = 1024 ** 3;
  const result = classifyCompatibility(
    {
      repoId: "example/llama-70B-GGUF",
      fileName: "llama-70B-Q4_K_M.gguf",
      sizeBytes: 42_500_000_000,
      quantization: "Q4_K_M",
      parameterCount: 70,
      downloadUrl: "https://example.invalid/llama-70B-Q4_K_M.gguf"
    },
    {
      platform: "darwin",
      arch: "arm64",
      cpuBrand: "Apple M2 Ultra",
      isMac: true,
      isAppleSilicon: true,
      totalMemoryBytes: 64 * GIB,
      availableMemoryBytes: 8 * GIB,
      recommendedModelMemoryBytes: Math.floor(64 * GIB * 0.8),
      storageRoot: "/tmp",
      availableDiskBytes: 500 * GIB
    },
    4096
  );
  assert.equal(result.status, "compatible");
});

test("selects the highest-quality compatible quantization for automagical setup", () => {
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

  assert.equal(selected?.fileName, "model-Q8_0.gguf");
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

test("automagical setup tries the configured repo before the ladder", () => {
  assert.deepEqual(
    automagicalModelRepos("custom/model-GGUF").slice(0, 2),
    ["custom/model-GGUF", DEFAULT_MODEL_REPO]
  );
  assert.deepEqual(
    automagicalModelRepos(`https://huggingface.co/${DEFAULT_MODEL_REPO}`).slice(0, 2),
    [DEFAULT_MODEL_REPO, AUTOMAGICAL_MODEL_REPOS[1]]
  );
  assert.equal(
    automagicalModelRepos(` ${DEFAULT_MODEL_REPO} `).filter((repoId) => repoId === DEFAULT_MODEL_REPO).length,
    1
  );
});

test("curated one-click model stays on Qwen3 and does not downgrade to Qwen2.5", () => {
  const paramBillions = (repoId) => {
    const match = repoId.match(/(\d+(?:\.\d+)?)\s*B\b/i);
    return match ? Number(match[1]) : 0;
  };
  const sizes = AUTOMAGICAL_MODEL_REPOS.map(paramBillions);

  assert.equal(AUTOMAGICAL_MODEL_REPOS[0], DEFAULT_MODEL_REPO);
  assert.equal(DEFAULT_MODEL_REPO, "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF");
  assert.deepEqual(AUTOMAGICAL_MODEL_REPOS, [
    "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
    "unsloth/gemma-4-26B-A4B-it-GGUF"
  ]);
  assert.ok(sizes[0] >= 20, `aggressive default should be a large model, got ${DEFAULT_MODEL_REPO}`);
  assert.ok(sizes[1] < sizes[0], `fallback should be smaller than Qwen3, got ${AUTOMAGICAL_MODEL_REPOS[1]}`);
  for (const repoId of AUTOMAGICAL_MODEL_REPOS) {
    assert.ok(repoId.includes("/"), repoId);
    assert.equal(repoId.split("/")[0], "unsloth", `unexpected publisher: ${repoId}`);
    assert.equal(/Qwen2\.5/i.test(repoId), false, `Qwen2.5 must not be an automatic default: ${repoId}`);
  }
  assert.equal(AUTOMAGICAL_MODEL_REPOS.includes("TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF"), false);
});

test("normalizes Hugging Face model URLs to repo ids", () => {
  assert.equal(
    normalizeHuggingFaceRepoId(`https://huggingface.co/${DEFAULT_MODEL_REPO}`),
    DEFAULT_MODEL_REPO
  );
  assert.equal(normalizeHuggingFaceRepoId(` ${DEFAULT_MODEL_REPO}/ `), DEFAULT_MODEL_REPO);
});

test("automagical quality floor accepts 4-bit and better, rejects 3-bit and below", () => {
  for (const quant of ["Q4_K_M", "Q4_K_S", "Q5_K_M", "Q6_K", "Q8_0", "F16"]) {
    assert.equal(meetsAutomagicalQualityFloor(quant), true, quant);
  }
  for (const quant of ["Q3_K_L", "Q3_K_M", "Q2_K", "IQ3_XS", "IQ2_XS"]) {
    assert.equal(meetsAutomagicalQualityFloor(quant), false, quant);
  }
});

test("sharded GGUF part files are detected so only single-file quants are offered", () => {
  assert.equal(isShardedGgufFileName("Qwen3-Coder-30B-A3B-Instruct-BF16-00001-of-00002.gguf"), true);
  assert.equal(isShardedGgufFileName("Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf"), false);
});

test("setup diagnostics distinguish ready setup from required action", () => {
  const ready = setupDiagnosticSummary({
    installedModelId: LOCAL_MOTION_MODEL_ID,
    installedFileValid: true,
    runtimeRunning: true,
    runtimeBaseUrl: "http://127.0.0.1:41434/v1",
    runtimeModelId: LOCAL_MOTION_MODEL_ID,
    endpointVerified: true,
    cursorSetupFreshness: "current",
    completedForInstalledModel: true
  });
  assert.equal(ready.status, "ready");
  assert.match(ready.message, /ready/);
  assert.equal(ready.lines.some((line) => line.includes("Cursor private state")), true);

  const missingModel = setupDiagnosticSummary({
    installedFileValid: false,
    runtimeRunning: false,
    endpointVerified: false,
    cursorSetupFreshness: "not-copied",
    completedForInstalledModel: false
  });
  assert.equal(missingModel.status, "action-needed");
  assert.match(missingModel.message, /Turn On Local Agent/);

  const stale = setupDiagnosticSummary({
    installedModelId: LOCAL_MOTION_MODEL_ID,
    installedFileValid: true,
    runtimeRunning: true,
    runtimeBaseUrl: "http://127.0.0.1:41434/v1",
    runtimeModelId: LOCAL_MOTION_MODEL_ID,
    endpointVerified: true,
    cursorSetupFreshness: "stale",
    completedForInstalledModel: true
  });
  assert.equal(stale.status, "action-needed");
  assert.match(stale.message, /Connect Cursor to Local Agent/);
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
  assert.equal(canReuseInstalledModelForDefault(installed, 4, "example/model-GGUF"), true);
  assert.equal(canReuseInstalledModelForDefault(installed, 4, DEFAULT_MODEL_REPO), false);
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

test("defaults omitted stream to false per the OpenAI chat completions spec", () => {
  assert.equal(sanitizeExternalChatRequest({ messages: [] }, "m").stream, false);
  assert.equal(sanitizeExternalChatRequest({ messages: [], stream: true }, "m").stream, true);
  assert.equal(sanitizeExternalChatRequest({ messages: [], stream: false }, "m").stream, false);
  assert.equal(sanitizeExternalChatRequest({ messages: [], stream: "yes" }, "m").stream, false);
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

  const proxy = new OpenAiProxy({ upstreamBaseUrl: "http://127.0.0.1:1/v1", modelId: LOCAL_MOTION_MODEL_ID });
  try {
    const baseUrl = await proxy.start(preferredPort);
    assert.equal(baseUrl, `http://127.0.0.1:${preferredPort}/v1`);
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${proxy.apiKey()}` }
    });
    assert.equal(response.status, 200);
  } finally {
    await proxy.stop();
  }
});

test("OpenAI proxy falls back to a dynamic port when the preferred Cursor port is occupied", async () => {
  const holder = await reserveLocalhostPort();
  const proxy = new OpenAiProxy({ upstreamBaseUrl: "http://127.0.0.1:1/v1", modelId: LOCAL_MOTION_MODEL_ID });
  try {
    const baseUrl = await proxy.start(holder.port);
    assert.notEqual(baseUrl, `http://127.0.0.1:${holder.port}/v1`);
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${proxy.apiKey()}` }
    });
    assert.equal(response.status, 200);
  } finally {
    await proxy.stop();
    await releasePortHolder(holder);
  }
});

test("OpenAI proxy flags only the first real inbound chat request", async () => {
  let notifications = 0;
  const proxy = new OpenAiProxy({
    upstreamBaseUrl: "http://127.0.0.1:1/v1",
    modelId: LOCAL_MOTION_MODEL_ID,
    onClientRequest: () => {
      notifications += 1;
    }
  });
  try {
    const baseUrl = await proxy.start();
    const authorized = { authorization: `Bearer ${proxy.apiKey()}` };
    assert.equal(proxy.hasServedClientRequest(), false);

    // Listing models is Local Motion's own verification path and Cursor's
    // model-list refresh. It must never be mistaken for the model being in use.
    const models = await fetch(`${baseUrl}/models`, { headers: authorized });
    assert.equal(models.status, 200);
    assert.equal(proxy.hasServedClientRequest(), false);
    assert.equal(notifications, 0);

    // An unauthorized chat attempt is rejected before it can count.
    const unauthorized = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(unauthorized.status, 401);
    assert.equal(proxy.hasServedClientRequest(), false);
    assert.equal(notifications, 0);

    // The first authorized chat request flips the flag and notifies once, even
    // though the upstream is unreachable in this test (the request is real).
    await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authorized },
      body: JSON.stringify({ messages: [] })
    });
    assert.equal(proxy.hasServedClientRequest(), true);
    assert.equal(notifications, 1);

    // Later requests keep the flag set but never notify again.
    await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authorized },
      body: JSON.stringify({ messages: [] })
    });
    assert.equal(proxy.hasServedClientRequest(), true);
    assert.equal(notifications, 1);
  } finally {
    await proxy.stop();
  }
});

test("generates and requires a per-session bearer token", () => {
  const first = generateApiKey();
  const second = generateApiKey();
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(first, second);
  assert.equal(isAuthorizedBearer(`Bearer ${first}`, first), true);
  assert.equal(isAuthorizedBearer("Bearer local-motion", first), false);
  assert.equal(isAuthorizedBearer("Bearer other", first), false);
  assert.equal(isAuthorizedBearer(`Bearer ${first}`, ""), false);
  assert.equal(isAuthorizedBearer(undefined, first), false);
});

test("OpenAI proxy serves a single JSON completion when the client omits stream", async () => {
  const completion = {
    id: "chatcmpl-local",
    object: "chat.completion",
    choices: [{ index: 0, message: { role: "assistant", content: "Hi" }, finish_reason: "stop" }]
  };
  let upstreamRequestBody;
  const upstream = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      upstreamRequestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(completion));
    });
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const proxy = new OpenAiProxy({
    upstreamBaseUrl: `http://127.0.0.1:${upstream.address().port}/v1`,
    modelId: LOCAL_MOTION_MODEL_ID
  });
  try {
    const baseUrl = await proxy.start();
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${proxy.apiKey()}` },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] })
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/json/);
    // The body must parse as one JSON object, not SSE "data:" frames.
    assert.deepEqual(JSON.parse(await response.text()), completion);
    assert.equal(upstreamRequestBody.stream, false);
  } finally {
    await proxy.stop();
    await new Promise((resolve) => upstream.close(resolve));
  }
});

test("OpenAI proxy rejects the legacy static bearer key and protects health", async () => {
  const proxy = new OpenAiProxy({ upstreamBaseUrl: "http://127.0.0.1:1/v1", modelId: LOCAL_MOTION_MODEL_ID });
  try {
    const baseUrl = await proxy.start();
    const legacy = await fetch(`${baseUrl}/models`, {
      headers: { authorization: "Bearer local-motion" }
    });
    assert.equal(legacy.status, 401);

    const healthWithoutBearer = await fetch(baseUrl.replace(/\/v1$/, "/health"));
    assert.equal(healthWithoutBearer.status, 401);
  } finally {
    await proxy.stop();
  }
});

test("Cursor setup view model uses the public tunnel endpoint", () => {
  const viewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    apiKey: "session-secret",
    cursorTunnel: { enabled: true, source: "manual", url: "https://public.example.com" },
    modelId: LOCAL_MOTION_MODEL_ID,
    message: "running"
  });
  assert.equal(viewModel.isRunning, true);
  assert.equal(viewModel.baseUrl, "https://public.example.com/v1");
  assert.equal(viewModel.apiKey, "session-secret");
  assert.equal(viewModel.modelId, LOCAL_MOTION_MODEL_ID);
  assert.ok(viewModel.setupBlock.includes("https://public.example.com/v1"));
  assert.ok(viewModel.setupBlock.includes(LOCAL_MOTION_MODEL_ID));
  assert.ok(viewModel.setupBlock.includes("session-secret"));
  assert.ok(viewModel.setupBlock.includes("Model name: Local Motion"));
  assert.ok(viewModel.statusMessage.includes("Cursor Settings > Models"));
  assert.ok(viewModel.steps.includes("Click Add Custom Model."));
  assert.ok(viewModel.steps.some((line) => line.includes("https://public.example.com/v1")));
  assert.equal(cursorSetupValue(viewModel, "baseUrl"), "https://public.example.com/v1");
  assert.equal(cursorSetupValue(viewModel, "apiKey"), "session-secret");
  assert.equal(cursorSetupValue(viewModel, "modelId"), LOCAL_MOTION_MODEL_ID);
  assert.equal(cursorSetupValue(viewModel, "setupBlock"), viewModel.setupBlock);
});

test("Cursor setup view model does not duplicate a tunnel v1 suffix", () => {
  const viewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    apiKey: "session-secret",
    cursorTunnel: { enabled: true, source: "manual", url: "https://public.example.com/v1/" },
    modelId: LOCAL_MOTION_MODEL_ID,
    message: "running"
  });
  assert.equal(viewModel.isRunning, true);
  assert.equal(viewModel.baseUrl, "https://public.example.com/v1");
});

test("Cursor setup view model refuses localhost without a tunnel", () => {
  const viewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    apiKey: "session-secret",
    modelId: LOCAL_MOTION_MODEL_ID,
    message: "running"
  });
  assert.equal(viewModel.isRunning, false);
  assert.equal(viewModel.baseUrl, "");
  assert.match(viewModel.statusMessage, /localhost/);
  assert.ok(viewModel.steps.some((line) => line.includes("cursorTunnel")));
});

test("manual Cursor tunnel URL normalization requires public HTTPS", () => {
  assert.deepEqual(normalizePublicHttpsTunnelUrl(""), { invalid: false });
  assert.deepEqual(normalizePublicHttpsTunnelUrl(" https://public.example.com/v1/ "), {
    url: "https://public.example.com",
    invalid: false
  });
  assert.deepEqual(normalizePublicHttpsTunnelUrl("https://public.example.com/custom/v1"), {
    url: "https://public.example.com/custom",
    invalid: false
  });

  for (const value of [
    "notaurl",
    "http://public.example.com",
    "https://localhost:41434/v1",
    "https://127.0.0.1:41434/v1",
    "https://10.0.0.10/v1",
    "https://172.16.1.1/v1",
    "https://192.168.1.1/v1",
    "https://100.64.0.1/v1",
    "https://[::1]/v1",
    "https://[fc00::1]/v1",
    "https://[fe80::1]/v1",
    "https://[2606:4700:4700::1111]/v1"
  ]) {
    assert.deepEqual(normalizePublicHttpsTunnelUrl(value), { invalid: true });
  }
});

test("Cursor setup view model explains tunnel error states while local runtime stays up", () => {
  const expected = [
    ["invalid-url", /must be a public HTTPS tunnel URL/, /private IPs/],
    ["binary-missing", /cloudflared is not installed/, /brew install cloudflared/],
    ["start-timeout", /did not become reachable/, /public HTTPS tunnel/],
    ["dns-unresolved", /did not become reachable/, /public HTTPS tunnel/],
    ["exited", /managed Cursor tunnel stopped/, /Restart the local model/]
  ];

  for (const [error, statusPattern, stepPattern] of expected) {
    const viewModel = cursorSetupViewModel({
      running: true,
      baseUrl: "http://127.0.0.1:50000/v1",
      apiKey: "session-secret",
      cursorTunnel: { enabled: true, source: "managed", error },
      modelId: LOCAL_MOTION_MODEL_ID,
      message: "running"
    });
    assert.equal(viewModel.isRunning, false);
    assert.equal(viewModel.baseUrl, "");
    assert.match(viewModel.statusMessage, statusPattern);
    assert.ok(viewModel.steps.some((line) => stepPattern.test(line)));
  }
});

test("Cursor setup view model does not invent endpoint values when stopped", () => {
  const viewModel = cursorSetupViewModel({
    running: false,
    message: "No model is running."
  });
  assert.equal(viewModel.isRunning, false);
  assert.equal(viewModel.baseUrl, "");
  assert.equal(viewModel.modelId, "");
  assert.equal(viewModel.apiKey, "");
  assert.equal(viewModel.statusMessage, "No model is running.");
  assert.ok(viewModel.steps.some((line) => line.includes("Start a local model")));
});

test("Cursor setup freshness recognizes unchanged copied endpoint", () => {
  const viewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    apiKey: "session-secret",
    cursorTunnel: { enabled: true, source: "manual", url: "https://public.example.com" },
    modelId: LOCAL_MOTION_MODEL_ID,
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
    apiKey: "session-secret",
    cursorTunnel: { enabled: true, source: "manual", url: "https://public.example.com" },
    modelId: LOCAL_MOTION_MODEL_ID,
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
    apiKey: "session-secret",
    cursorTunnel: { enabled: true, source: "manual", url: "https://old.example.com" },
    modelId: LOCAL_MOTION_MODEL_ID,
    message: "running"
  });
  const currentViewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50001/v1",
    apiKey: "session-secret",
    cursorTunnel: { enabled: true, source: "manual", url: "https://new.example.com" },
    modelId: LOCAL_MOTION_MODEL_ID,
    message: "running"
  });
  const freshness = cursorSetupFreshness(
    currentViewModel,
    lastCopiedCursorSetup(oldViewModel, "prepareCursor", "2026-06-16T00:00:00.000Z")
  );
  assert.equal(freshness.status, "stale");
  assert.ok(freshness.message.includes("old.example"));
  assert.ok(freshness.message.includes("new.example"));
});

test("Cursor setup freshness marks stopped model stale after copied setup values", () => {
  const runningViewModel = cursorSetupViewModel({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    apiKey: "session-secret",
    cursorTunnel: { enabled: true, source: "manual", url: "https://public.example.com" },
    modelId: LOCAL_MOTION_MODEL_ID,
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
    apiKey: "session-secret",
    cursorTunnel: { enabled: true, source: "manual", url: "https://public.example.com" },
    modelId: LOCAL_MOTION_MODEL_ID,
    message: "running"
  });
  assert.deepEqual(
    lastCopiedCursorSetup(viewModel, "prepareCursor", "2026-06-16T00:00:00.000Z", "2026-06-16T00:00:01.000Z"),
    {
      baseUrl: "https://public.example.com/v1",
      modelId: LOCAL_MOTION_MODEL_ID,
      apiKeyLabel: "session-key",
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
    apiKey: "session-secret",
    cursorTunnel: { enabled: true, source: "manual", url: "https://public.example.com" },
    modelId: LOCAL_MOTION_MODEL_ID,
    message: "running"
  });
  const copied = lastCopiedCursorSetup(viewModel, "prepareCursor", "2026-06-16T00:00:00.000Z", "2026-06-16T00:00:01.000Z");

  assert.deepEqual(
    automagicalSetupCompletion(copied, "2026-06-16T00:00:02.000Z"),
    {
      baseUrl: "https://public.example.com/v1",
      modelId: LOCAL_MOTION_MODEL_ID,
      apiKeyLabel: "session-key",
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
    apiKey: "session-secret",
    cursorTunnel: { enabled: true, source: "manual", url: "https://public.example.com" },
    modelId: LOCAL_MOTION_MODEL_ID,
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

test("Cursor setup workflow verifies, copies, opens settings, and records completion", async () => {
  const harness = cursorSetupWorkflowHarness();
  const result = await harness.workflow.prepareCursorAndMarkCompleted();

  assert.equal(result.verification.ok, true);
  assert.equal(result.copy.ok, true);
  assert.equal(result.settings.ok, true);
  assert.equal(harness.requests[0].input, "https://public.example.com/v1/models");
  assert.equal(harness.requests[0].authorization, "Bearer session-secret");
  assert.equal(harness.clipboardWrites.length, 1);
  assert.ok(harness.clipboardWrites[0].includes(LOCAL_MOTION_MODEL_ID));
  assert.deepEqual(harness.openedSettings, ["Cursor Models"]);
  assert.equal(harness.lastCopied?.endpointVerifiedAt, "2026-06-16T00:00:00.000Z");
  assert.equal(harness.completion?.modelId, LOCAL_MOTION_MODEL_ID);
  assert.equal(harness.completion?.completedAt, "2026-06-16T00:00:01.000Z");
});

test("Cursor setup workflow does not copy or open settings when endpoint verification fails", async () => {
  const harness = cursorSetupWorkflowHarness({ modelIds: ["other-model"] });
  const result = await harness.workflow.prepareCursorAndMarkCompleted();

  assert.equal(result.verification.ok, false);
  assert.equal(result.copy.ok, false);
  assert.equal(result.settings.ok, false);
  assert.deepEqual(harness.clipboardWrites, []);
  assert.deepEqual(harness.openedSettings, []);
  assert.equal(harness.lastCopied, undefined);
  assert.equal(harness.completion, undefined);
});

test("validates Cursor setup copy keys at runtime", () => {
  assert.equal(isCursorSetupValueKey("apiKey"), true);
  assert.equal(isCursorSetupValueKey("baseUrl"), true);
  assert.equal(isCursorSetupValueKey("modelId"), true);
  assert.equal(isCursorSetupValueKey("setupBlock"), true);
  assert.equal(isCursorSetupValueKey("bad"), false);
  assert.equal(isCursorSetupValueKey(undefined), false);
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
    modelId: LOCAL_MOTION_MODEL_ID,
    displayName: "Example",
    contextTokens: 8192
  };
  const completion = {
    baseUrl: "http://127.0.0.1:50000/v1",
    modelId: LOCAL_MOTION_MODEL_ID,
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

test("provider no-model error points to the local agent switch", () => {
  assert.equal(
    NO_INSTALLED_MODEL_MESSAGE,
    "No Local Motion model is installed. Run Local Motion: Turn On Local Agent."
  );
  assert.equal(NO_INSTALLED_MODEL_MESSAGE.includes("Open Setup first"), false);
});

test("startup resume does not install missing llama dependency", () => {
  assert.equal(allowLlamaInstallForAutomagicalStart("explicit"), true);
  assert.equal(allowLlamaInstallForAutomagicalStart("startupResume"), false);
});

test("setup panel does not load default quantizations before advanced controls ask", () => {
  assert.equal(shouldPostInitialQuantizations({ setupOperationActive: false }), false);
  assert.equal(shouldPostInitialQuantizations({ setupOperationActive: true }), false);
});

test("state validators reject stale persisted setup shapes", () => {
  const copied = {
    baseUrl: "http://127.0.0.1:41434/v1",
    modelId: LOCAL_MOTION_MODEL_ID,
    apiKeyLabel: "session-key",
    copiedAt: "2026-06-16T00:00:00.000Z",
    trigger: "prepareCursor",
    endpointVerifiedAt: "2026-06-16T00:00:01.000Z"
  };
  const completion = {
    baseUrl: "http://127.0.0.1:41434/v1",
    modelId: LOCAL_MOTION_MODEL_ID,
    apiKeyLabel: "session-key",
    cursorSetupCopiedAt: "2026-06-16T00:00:00.000Z",
    endpointVerifiedAt: "2026-06-16T00:00:01.000Z",
    completedAt: "2026-06-16T00:00:02.000Z"
  };

  assert.equal(isLastCopiedCursorSetup(copied), true);
  assert.equal(isLastCopiedCursorSetup({ ...copied, apiKeyLabel: "local-motion" }), true);
  assert.equal(isLastCopiedCursorSetup({ ...copied, trigger: "bad" }), false);
  assert.equal(isLastCopiedCursorSetup({ ...copied, apiKeyLabel: "wrong-key" }), false);
  assert.equal(isLastCopiedCursorSetup({ ...copied, baseUrl: "" }), false);
  assert.equal(isLastCopiedCursorSetup(true), false);
  assert.equal(isAutomagicalSetupCompletion(completion), true);
  assert.equal(isAutomagicalSetupCompletion({ ...completion, apiKeyLabel: "local-motion" }), true);
  assert.equal(isAutomagicalSetupCompletion({ ...completion, apiKeyLabel: "wrong-key" }), false);
  assert.equal(isAutomagicalSetupCompletion({ ...completion, endpointVerifiedAt: "" }), false);
  assert.equal(isAutomagicalSetupCompletion(true), false);
});

function cursorSetupWorkflowHarness(options = {}) {
  const runtime = {
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    apiKey: "session-secret",
    cursorTunnel: { enabled: true, source: "manual", url: "https://public.example.com" },
    modelId: LOCAL_MOTION_MODEL_ID,
    message: "running"
  };
  const modelIds = options.modelIds ?? [LOCAL_MOTION_MODEL_ID];
  const clipboardWrites = [];
  const openedSettings = [];
  const requests = [];
  const timestamps = [
    "2026-06-16T00:00:00.000Z",
    "2026-06-16T00:00:01.000Z",
    "2026-06-16T00:00:02.000Z"
  ];
  let lastCopied;
  let completion;
  const state = {
    lastCopiedCursorSetup: () => lastCopied,
    setLastCopiedCursorSetup: async (setup) => {
      lastCopied = setup;
    },
    markAutomagicalSetupCompleted: async (value) => {
      completion = value;
    }
  };
  const host = {
    writeClipboardText: async (value) => {
      clipboardWrites.push(value);
    },
    openSettings: async (query) => {
      openedSettings.push(query);
    },
    fetch: async (input, init) => {
      requests.push({ input, authorization: init?.headers?.Authorization });
      return new Response(JSON.stringify({ data: modelIds.map((id) => ({ id })) }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    },
    now: () => timestamps.shift() ?? "2026-06-16T00:00:09.000Z"
  };

  return {
    workflow: new CursorSetupWorkflow(state, () => runtime, host),
    clipboardWrites,
    openedSettings,
    requests,
    get lastCopied() {
      return lastCopied;
    },
    get completion() {
      return completion;
    }
  };
}
