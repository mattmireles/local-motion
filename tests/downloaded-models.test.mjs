import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  deleteDownloadedModel,
  listDownloadedModels,
  resolveDownloadedModelId
} from "../out/models/downloadedModels.js";

test("lists downloaded GGUF models and totals their storage use", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-motion-models-"));
  const modelsRoot = path.join(root, "models");
  const first = path.join(modelsRoot, "example-alpha-main", "alpha.gguf");
  const second = path.join(modelsRoot, "example-beta-main", "beta.gguf.part");
  await fs.mkdir(path.dirname(first), { recursive: true });
  await fs.mkdir(path.dirname(second), { recursive: true });
  await fs.writeFile(first, "alpha");
  await fs.writeFile(second, "partial");
  await fs.writeFile(path.join(modelsRoot, "ignore.txt"), "ignore");

  try {
    const result = await listDownloadedModels(modelsRoot, {
      installed: installedModel(first),
      active: { ...installedModel(first), baseUrl: "http://127.0.0.1:1/v1", upstreamBaseUrl: "http://127.0.0.1:2/v1", port: 1 }
    });

    assert.equal(result.totalSizeBytes, 12);
    assert.deepEqual(result.models.map((model) => model.fileName), ["alpha.gguf", "beta.gguf.part"]);
    assert.equal(result.models[0].active, true);
    assert.equal(result.models[0].installed, true);
    assert.equal(result.models[0].partial, false);
    assert.equal(result.models[1].partial, true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("delete removes only the selected model file and its empty parent directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-motion-models-"));
  const modelsRoot = path.join(root, "models");
  const selected = path.join(modelsRoot, "example-alpha-main", "alpha.gguf");
  const kept = path.join(modelsRoot, "example-beta-main", "beta.gguf");
  await fs.mkdir(path.dirname(selected), { recursive: true });
  await fs.mkdir(path.dirname(kept), { recursive: true });
  await fs.writeFile(selected, "alpha");
  await fs.writeFile(kept, "beta");

  try {
    const deleted = await deleteDownloadedModel(modelsRoot, "example-alpha-main/alpha.gguf");

    assert.equal(deleted, selected);
    await assert.rejects(fs.access(selected));
    await assert.rejects(fs.access(path.dirname(selected)));
    assert.equal(await fs.readFile(kept, "utf8"), "beta");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("delete ignores a concurrently removed parent directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-motion-models-"));
  const modelsRoot = path.join(root, "models");
  const selected = path.join(modelsRoot, "example-alpha-main", "alpha.gguf");
  await fs.mkdir(path.dirname(selected), { recursive: true });
  await fs.writeFile(selected, "alpha");
  const originalReaddir = fs.readdir;

  try {
    fs.readdir = async (target, options) => {
      if (target === path.dirname(selected)) {
        await fs.rm(target, { recursive: true, force: true });
      }
      return originalReaddir(target, options);
    };

    const deleted = await deleteDownloadedModel(modelsRoot, "example-alpha-main/alpha.gguf");

    assert.equal(deleted, selected);
    await assert.rejects(fs.access(path.dirname(selected)));
  } finally {
    fs.readdir = originalReaddir;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("downloaded model ids cannot escape Local Motion model storage", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-motion-models-"));
  const modelsRoot = path.join(root, "models");
  try {
    assert.throws(() => resolveDownloadedModelId(modelsRoot, "../outside.gguf"), /inside Local Motion model storage/);
    assert.throws(() => resolveDownloadedModelId(modelsRoot, path.join(root, "outside.gguf")), /Invalid downloaded model id/);
    assert.throws(() => resolveDownloadedModelId(modelsRoot, "example-alpha-main/readme.txt"), /GGUF file/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

function installedModel(modelPath) {
  return {
    repoId: "example/model-GGUF",
    fileName: path.basename(modelPath),
    revision: "main",
    sizeBytes: 5,
    modelPath,
    modelId: "local-motion-example",
    displayName: "Example",
    contextTokens: 8192
  };
}
