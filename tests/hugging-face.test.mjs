import assert from "node:assert/strict";
import { test } from "node:test";
import { listQuantizations } from "../out/models/huggingFace.js";

const GIB = 1024 ** 3;
const MACHINE = {
  platform: "darwin",
  arch: "arm64",
  cpuBrand: "Apple M2 Ultra",
  isMac: true,
  isAppleSilicon: true,
  totalMemoryBytes: 64 * GIB,
  availableMemoryBytes: 32 * GIB,
  recommendedModelMemoryBytes: Math.floor(64 * GIB * 0.8),
  storageRoot: "/tmp",
  availableDiskBytes: 500 * GIB
};

async function withMockedFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("listQuantizations reads SHA-256 from current HF lfs.sha256 field", async () => {
  await withMockedFetch(async (url) => {
    assert.match(String(url), /api\/models\/unsloth\/Qwen3-Coder-30B-A3B-Instruct-GGUF\?blobs=true/);
    return Response.json({
      id: "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
      sha: "b17cb02dd882d5b6ab62fc777ad2995f19668350",
      siblings: [
        {
          rfilename: "Qwen3-Coder-30B-A3B-Instruct-Q8_0.gguf",
          size: 32483935392,
          lfs: {
            sha256: "4ff1cff607804037bf6d2168249c570baa4e1621292b159c0e06591e0d7c3066",
            size: 32483935392,
            pointerSize: 136
          }
        }
      ]
    });
  }, async () => {
    const files = await listQuantizations(
      "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
      MACHINE,
      32_768
    );

    assert.equal(files.length, 1);
    assert.equal(
      files[0].sha256,
      "4ff1cff607804037bf6d2168249c570baa4e1621292b159c0e06591e0d7c3066"
    );
    assert.equal(files[0].sizeBytes, 32483935392);
  });
});

test("listQuantizations still accepts legacy HF lfs.oid sha256: prefix", async () => {
  await withMockedFetch(async () => {
    return Response.json({
      id: "example/model",
      sha: "abc123",
      siblings: [
        {
          rfilename: "model-Q4_K_M.gguf",
          size: 100,
          lfs: {
            oid: "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
            size: 100
          }
        }
      ]
    });
  }, async () => {
    const files = await listQuantizations("example/model", MACHINE, 32_768);

    assert.equal(files.length, 1);
    assert.equal(
      files[0].sha256,
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );
  });
});

test("listQuantizations leaves sha256 unset when HF reports neither field", async () => {
  await withMockedFetch(async () => {
    return Response.json({
      id: "example/model",
      sha: "abc123",
      siblings: [
        {
          rfilename: "model-Q4_K_M.gguf",
          size: 100
        }
      ]
    });
  }, async () => {
    const files = await listQuantizations("example/model", MACHINE, 32_768);

    assert.equal(files.length, 1);
    assert.equal(files[0].sha256, undefined);
  });
});
