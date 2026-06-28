import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeContiguousPrefixBytes,
  createManifestFromPartial
} from "../out/runtime/downloadManifest.js";

test("contiguous prefix ignores out-of-order completed chunks", () => {
  const manifest = {
    version: 1,
    totalBytes: 100,
    chunkSizeBytes: 25,
    completedChunks: [0, 2]
  };
  assert.equal(computeContiguousPrefixBytes(manifest), 25);
});

test("createManifestFromPartial ignores sparse full-size files", () => {
  const manifest = createManifestFromPartial({
    partialPath: "unused",
    totalBytes: 100,
    chunkSizeBytes: 25,
    statSize: 100
  });
  assert.deepEqual(manifest.completedChunks, []);
});
