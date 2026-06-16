import assert from "node:assert/strict";
import { test } from "node:test";
import { cursorSetupViewModel } from "../out/cursor/cursorIntegration.js";
import {
  effectiveMemoryBudget,
  parameterCountFromText,
  quantizationFromFileName
} from "../out/models/compatibility.js";
import {
  isAuthorizedBearer,
  LOCAL_MOTION_API_KEY,
  sanitizeExternalChatRequest,
  sanitizeStop
} from "../out/runtime/openAiChat.js";
import { childFailureMessage } from "../out/runtime/llamaHealth.js";
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
