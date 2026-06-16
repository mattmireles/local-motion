import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import type { GgufFile } from "../types";
import { parseContentLengthHeader } from "./runtimeGuards";
import { safeId } from "../util/format";

const DOWNLOAD_TIMEOUT_MS = 4 * 60 * 60 * 1000;

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
  resumed: boolean;
}

export async function downloadGguf(
  file: GgufFile,
  modelsRoot: string,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal
): Promise<string> {
  const targetDir = path.join(modelsRoot, safeId(`${file.repoId}-${file.revision ?? "unknown-revision"}`));
  await fs.promises.mkdir(targetDir, { recursive: true });

  const targetPath = path.join(targetDir, path.basename(file.fileName));
  const partialPath = `${targetPath}.part`;
  if (await exists(targetPath)) {
    await validateExistingFile(targetPath, file.sizeBytes, file.sha256);
    return targetPath;
  }

  const existingBytes = (await statSize(partialPath)) ?? 0;
  const headers: Record<string, string> = {};
  if (existingBytes > 0) {
    headers.range = `bytes=${existingBytes}-`;
  }

  const response = await fetch(file.downloadUrl, {
    headers,
    signal: mergeAbortSignals(signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS))
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  if (existingBytes > 0 && response.status !== 206) {
    await fs.promises.rm(partialPath, { force: true });
  }

  const resumed = existingBytes > 0 && response.status === 206;
  const contentLength = parseContentLengthHeader(response.headers.get("content-length"));
  const totalBytes =
    file.sizeBytes ?? (contentLength !== undefined ? contentLength + (resumed ? existingBytes : 0) : undefined);
  let downloadedBytes = resumed ? existingBytes : 0;

  const writeStream = fs.createWriteStream(partialPath, { flags: resumed ? "a" : "w" });
  const progressStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      downloadedBytes += chunk.byteLength;
      onProgress({
        downloadedBytes,
        totalBytes,
        percent: totalBytes ? Math.min(100, (downloadedBytes / totalBytes) * 100) : undefined,
        resumed
      });
      controller.enqueue(chunk);
    }
  });

  try {
    if (!response.body) {
      throw new Error("Download response did not include a body.");
    }
    await pipeline(response.body.pipeThrough(progressStream), writeStream);
    if (totalBytes !== undefined) {
      const stat = await fs.promises.stat(partialPath);
      if (stat.size !== totalBytes) {
        throw new Error(`Downloaded size mismatch: expected ${totalBytes} bytes, got ${stat.size} bytes.`);
      }
    }
    if (file.sha256) {
      await assertSha256(partialPath, file.sha256);
    }
    await fs.promises.rename(partialPath, targetPath);
    return targetPath;
  } catch (error) {
    writeStream.destroy();
    if (signal.aborted) {
      await fs.promises.rm(partialPath, { force: true });
    }
    throw error;
  }
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function statSize(targetPath: string): Promise<number | undefined> {
  try {
    const stat = await fs.promises.stat(targetPath);
    return stat.size;
  } catch {
    return undefined;
  }
}

async function validateExistingFile(
  targetPath: string,
  expectedSize: number | undefined,
  expectedSha256: string | undefined
): Promise<void> {
  if (expectedSize !== undefined) {
    const stat = await fs.promises.stat(targetPath);
    if (stat.size !== expectedSize) {
      await fs.promises.rm(targetPath, { force: true });
      throw new Error(
        `Existing model file size mismatch: expected ${expectedSize} bytes, got ${stat.size} bytes. Removed ${targetPath}; retry the download.`
      );
    }
  }
  if (expectedSha256) {
    await assertSha256(targetPath, expectedSha256);
  }
}

async function assertSha256(targetPath: string, expectedSha256: string): Promise<void> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(targetPath)) {
    hash.update(chunk);
  }
  const actual = hash.digest("hex");
  if (actual !== expectedSha256.toLowerCase()) {
    await fs.promises.rm(targetPath, { force: true });
    throw new Error(`Downloaded SHA-256 mismatch for ${targetPath}. Removed file; retry the download.`);
  }
}

function mergeAbortSignals(userSignal: AbortSignal, timeoutSignal: AbortSignal): AbortSignal {
  if (userSignal.aborted || timeoutSignal.aborted) {
    return AbortSignal.abort(userSignal.reason ?? timeoutSignal.reason);
  }
  const controller = new AbortController();
  const abort = () => controller.abort(userSignal.reason ?? timeoutSignal.reason);
  userSignal.addEventListener("abort", abort, { once: true });
  timeoutSignal.addEventListener("abort", abort, { once: true });
  return controller.signal;
}
