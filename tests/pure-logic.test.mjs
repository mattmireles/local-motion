import assert from "node:assert/strict";
import { test } from "node:test";
import { cursorInstructions } from "../out/cursor/cursorIntegration.js";
import { parameterCountFromText, quantizationFromFileName } from "../out/models/compatibility.js";
import {
  isAuthorizedBearer,
  LOCAL_MOTION_API_KEY,
  sanitizeExternalChatRequest
} from "../out/runtime/openAiChat.js";

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
