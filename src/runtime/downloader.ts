import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { GgufFile } from "../types";
import { parseContentLengthHeader } from "./runtimeGuards";
import { safeId } from "../util/format";

const DOWNLOAD_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const SLOW_CHECK_INTERVAL_MS = 15_000;
const READ_IDLE_TIMEOUT_MS = 30_000;
const SLOW_GRACE_BYTES = 8 * 1024 * 1024;
const MIN_BYTES_PER_SECOND = 2 * 1024 * 1024;
const MAX_SEGMENT_ATTEMPTS = 4;

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes?: number;
  percent?: number;
  resumed: boolean;
  bytesPerSecond?: number;
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

  const initialBytes = (await statSize(partialPath)) ?? 0;
  if (file.sizeBytes !== undefined && initialBytes > file.sizeBytes) {
    await fs.promises.rm(partialPath, { force: true });
  }

  let downloadedBytes = await statSize(partialPath) ?? 0;
  let totalBytes = file.sizeBytes;
  let segmentFailures = 0;
  let retrySlowStreams = true;
  const startedWithPartial = downloadedBytes > 0;

  while (totalBytes === undefined || downloadedBytes < totalBytes) {
    const segmentStart = downloadedBytes;

    try {
      const result = await downloadSegment({
        url: file.downloadUrl,
        partialPath,
        start: segmentStart,
        knownTotalBytes: totalBytes,
        retrySlowStreams,
        signal,
        onProgress: (progress) => {
          downloadedBytes = progress.downloadedBytes;
          totalBytes = progress.totalBytes;
          onProgress({
            ...progress,
            resumed: startedWithPartial || progress.resumed
          });
        }
      });
      downloadedBytes = result.downloadedBytes;
      totalBytes = result.totalBytes;
      if (result.complete && totalBytes === undefined) {
        break;
      }
      segmentFailures = 0;
    } catch (error) {
      if (signal.aborted || !isRetryableSegmentError(error) || segmentFailures >= MAX_SEGMENT_ATTEMPTS - 1) {
        if (error instanceof SlowDownloadError && segmentFailures >= MAX_SEGMENT_ATTEMPTS - 1) {
          retrySlowStreams = false;
          segmentFailures = 0;
          continue;
        }
        throw error;
      }
      segmentFailures += 1;
    }
  }

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
}

interface DownloadSegmentOptions {
  url: string;
  partialPath: string;
  start: number;
  knownTotalBytes?: number;
  retrySlowStreams: boolean;
  signal: AbortSignal;
  onProgress: (progress: DownloadProgress) => void;
}

interface DownloadSegmentResult {
  downloadedBytes: number;
  totalBytes?: number;
  complete: boolean;
}

class SlowDownloadError extends Error {
  constructor(bytesPerSecond: number) {
    super(`Download stream too slow: ${formatBytesPerSecond(bytesPerSecond)}. Retrying with a fresh connection.`);
  }
}

class IdleDownloadError extends Error {
  constructor() {
    super("Download stream stopped sending bytes. Retrying with a fresh connection.");
  }
}

async function downloadSegment(options: DownloadSegmentOptions): Promise<DownloadSegmentResult> {
  await ensureFile(options.partialPath);
  await fs.promises.truncate(options.partialPath, options.start);
  const headers: Record<string, string> = {};
  if (options.start > 0) {
    headers.range = `bytes=${options.start}-`;
  }

  const response = await fetch(options.url, {
    headers,
    signal: mergeAbortSignals(options.signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS))
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Download response did not include a body.");
  }

  const contentLength = parseContentLengthHeader(response.headers.get("content-length"));
  const contentRange = parseContentRange(response.headers.get("content-range"));
  if (response.status === 206) {
    validateContentRange(contentRange, options.start);
  }
  const responseStart = response.status === 206 ? options.start : 0;
  if (responseStart !== options.start) {
    await fs.promises.truncate(options.partialPath, responseStart);
  }
  const totalBytes = options.knownTotalBytes ?? inferTotalBytes({
    contentLength,
    start: responseStart,
    contentRange
  });
  let downloadedBytes = responseStart;
  let lastCheckBytes = responseStart;
  let lastCheckTime = Date.now();
  const reader = response.body.getReader();
  const file = await fs.promises.open(options.partialPath, "r+");
  let completed = false;

  try {
    while (true) {
      const { done, value } = await readWithIdleTimeout(reader);
      if (done) {
        completed = true;
        break;
      }
      if (value.byteLength === 0) {
        continue;
      }

      await file.write(value, 0, value.byteLength, downloadedBytes);
      downloadedBytes += value.byteLength;
      const now = Date.now();
      const intervalMs = now - lastCheckTime;
      const intervalBytes = downloadedBytes - lastCheckBytes;
      const bytesPerSecond = intervalMs > 0 ? intervalBytes / (intervalMs / 1000) : undefined;

      options.onProgress({
        downloadedBytes,
        totalBytes,
        percent: totalBytes ? Math.min(100, (downloadedBytes / totalBytes) * 100) : undefined,
        resumed: responseStart > 0,
        bytesPerSecond
      });

      if (intervalMs >= SLOW_CHECK_INTERVAL_MS) {
        if (
          options.retrySlowStreams &&
          downloadedBytes >= SLOW_GRACE_BYTES &&
          intervalBytes / (intervalMs / 1000) < MIN_BYTES_PER_SECOND
        ) {
          throw new SlowDownloadError(intervalBytes / (intervalMs / 1000));
        }
        lastCheckBytes = downloadedBytes;
        lastCheckTime = now;
      }
    }
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    await file.close();
    reader.releaseLock();
  }

  const expectedSegmentBytes = contentLength ?? (
    contentRange === undefined ? undefined : contentRange.end - contentRange.start + 1
  );
  if (expectedSegmentBytes !== undefined && downloadedBytes - responseStart !== expectedSegmentBytes) {
    throw new Error(
      `Downloaded segment size mismatch: expected ${expectedSegmentBytes} bytes, got ${downloadedBytes - responseStart} bytes.`
    );
  }
  return {
    downloadedBytes,
    totalBytes,
    complete: totalBytes === undefined || downloadedBytes >= totalBytes
  };
}

function inferTotalBytes(input: {
  contentLength?: number;
  start: number;
  contentRange: ContentRange | undefined;
}): number | undefined {
  if (input.contentRange?.total !== undefined) {
    return input.contentRange.total;
  }
  if (input.contentLength === undefined) {
    return undefined;
  }
  return input.start + input.contentLength;
}

interface ContentRange {
  start: number;
  end: number;
  total?: number;
}

function parseContentRange(value: string | null): ContentRange | undefined {
  const match = value?.match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (!match) {
    return undefined;
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === "*" ? undefined : Number(match[3]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || (total !== undefined && !Number.isFinite(total))) {
    return undefined;
  }
  return { start, end, total };
}

function validateContentRange(range: ContentRange | undefined, start: number): void {
  if (!range) {
    throw new Error("Download response did not include a valid Content-Range header.");
  }
  if (range.start !== start || range.end < range.start) {
    throw new Error(`Download response returned an unexpected byte range: ${range.start}-${range.end}.`);
  }
}

function isRetryableSegmentError(error: unknown): boolean {
  return error instanceof SlowDownloadError ||
    error instanceof IdleDownloadError ||
    (error instanceof Error && (
      error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      /Downloaded segment size mismatch|unexpected byte range|valid Content-Range/i.test(error.message) ||
      /terminated|ECONNRESET|ETIMEDOUT|EPIPE|socket|network/i.test(error.message)
    ));
}

async function readWithIdleTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
        timeout = setTimeout(() => reject(new IdleDownloadError()), READ_IDLE_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function ensureFile(targetPath: string): Promise<void> {
  const file = await fs.promises.open(targetPath, "a");
  await file.close();
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

function formatBytesPerSecond(bytesPerSecond: number): string {
  const mib = bytesPerSecond / 1024 / 1024;
  return `${mib.toFixed(2)} MiB/s`;
}
