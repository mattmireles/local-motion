import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { downloadGguf } from "../out/runtime/downloader.js";

async function withDownloadSandbox(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "local-motion-downloader-"));
  const originalFetch = globalThis.fetch;
  try {
    return await run({
      root,
      modelsRoot: path.join(root, "models")
    });
  } finally {
    globalThis.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
}

function testFile(overrides = {}) {
  return {
    repoId: "example/model",
    revision: "main",
    fileName: "model.gguf",
    downloadUrl: "https://example.invalid/model.gguf",
    sizeBytes: 11,
    ...overrides
  };
}

test("resumes from the latest partial size after a short range segment", async () => {
  await withDownloadSandbox(async ({ modelsRoot }) => {
    const targetDir = path.join(modelsRoot, "example-model-main");
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "model.gguf.part"), "hello ");

    const requests = [];
    globalThis.fetch = async (_url, init = {}) => {
      requests.push(init.headers?.range);
      if (requests.length === 1) {
        return new Response(new TextEncoder().encode("wo"), {
          status: 206,
          headers: {
            "content-length": "5",
            "content-range": "bytes 6-10/11"
          }
        });
      }
      return new Response(new TextEncoder().encode("rld"), {
        status: 206,
        headers: {
          "content-length": "3",
          "content-range": "bytes 8-10/11"
        }
      });
    };

    const result = await downloadGguf(
      testFile(),
      modelsRoot,
      () => {},
      new AbortController().signal
    );

    assert.equal(await fs.readFile(result, "utf8"), "hello world");
    assert.deepEqual(requests, ["bytes=6-", "bytes=8-"]);
  });
});

test("accepts a full 200 response when the first range request is ignored", async () => {
  await withDownloadSandbox(async ({ modelsRoot }) => {
    const requests = [];
    globalThis.fetch = async (_url, init = {}) => {
      requests.push(init.headers?.range);
      return new Response(new TextEncoder().encode("hello world"), {
        status: 200,
        headers: { "content-length": "11" }
      });
    };

    const result = await downloadGguf(testFile(), modelsRoot, () => {}, new AbortController().signal);

    assert.equal(await fs.readFile(result, "utf8"), "hello world");
    assert.deepEqual(requests, [undefined]);
  });
});

test("restarts from zero when a resumed request gets a full 200 response", async () => {
  await withDownloadSandbox(async ({ modelsRoot }) => {
    const targetDir = path.join(modelsRoot, "example-model-main");
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(path.join(targetDir, "model.gguf.part"), "stale ");
    const requests = [];
    globalThis.fetch = async (_url, init = {}) => {
      requests.push(init.headers?.range);
      return new Response(new TextEncoder().encode("hello world"), {
        status: 200,
        headers: { "content-length": "11" }
      });
    };

    const result = await downloadGguf(testFile(), modelsRoot, () => {}, new AbortController().signal);

    assert.equal(await fs.readFile(result, "utf8"), "hello world");
    assert.deepEqual(requests, ["bytes=6-"]);
  });
});

test("rejects mismatched content ranges before corrupting the partial", async () => {
  await withDownloadSandbox(async ({ modelsRoot }) => {
    const targetDir = path.join(modelsRoot, "example-model-main");
    await fs.mkdir(targetDir, { recursive: true });
    const partialPath = path.join(targetDir, "model.gguf.part");
    await fs.writeFile(partialPath, "hello ");

    globalThis.fetch = async () => new Response(new TextEncoder().encode("bad"), {
      status: 206,
      headers: {
        "content-length": "3",
        "content-range": "bytes 0-2/11"
      }
    });

    await assert.rejects(
      () => downloadGguf(testFile(), modelsRoot, () => {}, new AbortController().signal),
      /unexpected byte range/
    );
    assert.equal(await fs.readFile(partialPath, "utf8"), "hello ");
  });
});

test("rejects short resumed responses even when total size is unknown", async () => {
  await withDownloadSandbox(async ({ modelsRoot }) => {
    const targetDir = path.join(modelsRoot, "example-model-main");
    await fs.mkdir(targetDir, { recursive: true });
    const partialPath = path.join(targetDir, "model.gguf.part");
    await fs.writeFile(partialPath, "hello ");

    globalThis.fetch = async () => new Response(new TextEncoder().encode("wo"), {
      status: 206,
      headers: {
        "content-range": "bytes 6-10/*"
      }
    });

    await assert.rejects(
      () => downloadGguf(testFile({ sizeBytes: undefined }), modelsRoot, () => {}, new AbortController().signal),
      /Downloaded segment size mismatch|unexpected byte range/
    );
    assert.equal(await fs.readFile(partialPath, "utf8"), "hello wo");
  });
});

test("preserves resumable partial data when the user cancels", async () => {
  await withDownloadSandbox(async ({ modelsRoot }) => {
    const targetDir = path.join(modelsRoot, "example-model-main");
    await fs.mkdir(targetDir, { recursive: true });
    const partialPath = path.join(targetDir, "model.gguf.part");
    await fs.writeFile(partialPath, "hello ");
    const controller = new AbortController();

    globalThis.fetch = async () => {
      controller.abort();
      throw new DOMException("This operation was aborted", "AbortError");
    };

    await assert.rejects(
      () => downloadGguf(testFile(), modelsRoot, () => {}, controller.signal),
      /aborted/i
    );
    assert.equal(await fs.readFile(partialPath, "utf8"), "hello ");
  });
});
