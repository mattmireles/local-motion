import assert from "node:assert/strict";
import { test } from "node:test";
import { cursorInstructions } from "../out/cursor/cursorIntegration.js";
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

test("Cursor instructions use the active runtime endpoint", () => {
  const instructions = cursorInstructions({
    running: true,
    baseUrl: "http://127.0.0.1:50000/v1",
    modelId: "local-motion-test",
    message: "running"
  });
  assert.ok(instructions.some((line) => line.includes("http://127.0.0.1:50000/v1")));
  assert.ok(instructions.some((line) => line.includes("local-motion-test")));
  assert.ok(instructions.some((line) => line.includes(LOCAL_MOTION_API_KEY)));
});
