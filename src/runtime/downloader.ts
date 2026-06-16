import * as fs from "node:fs";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import type { GgufFile } from "../types";
import { safeId } from "../util/format";

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
    await validateExistingFile(targetPath, file.sizeBytes);
    return targetPath;
  }

  const existingBytes = (await statSize(partialPath)) ?? 0;
  const headers: Record<string, string> = {};
  if (existingBytes > 0) {
    headers.range = `bytes=${existingBytes}-`;
  }

  const response = await fetch(file.downloadUrl, { headers, signal });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  if (existingBytes > 0 && response.status !== 206) {
    await fs.promises.rm(partialPath, { force: true });
  }

  const resumed = existingBytes > 0 && response.status === 206;
  const contentLength = Number(response.headers.get("content-length"));
  const totalBytes =
    file.sizeBytes ?? (Number.isFinite(contentLength) ? contentLength + (resumed ? existingBytes : 0) : undefined);
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

async function validateExistingFile(targetPath: string, expectedSize: number | undefined): Promise<void> {
  if (expectedSize === undefined) {
    return;
  }
  const stat = await fs.promises.stat(targetPath);
  if (stat.size !== expectedSize) {
    await fs.promises.rm(targetPath, { force: true });
    throw new Error(
      `Existing model file size mismatch: expected ${expectedSize} bytes, got ${stat.size} bytes. Removed ${targetPath}; retry the download.`
    );
  }
}
