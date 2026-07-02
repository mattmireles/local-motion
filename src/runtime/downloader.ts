import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { GgufFile } from "../types";
import {
  computeContiguousPrefixBytes,
  computeManifestDownloadedBytes,
  createManifestFromPartial,
  loadManifest,
  manifestMatchesDownload,
  manifestPathForPartial,
  saveManifest,
  type DownloadManifest
} from "./downloadManifest";
import { parseContentLengthHeader } from "./runtimeGuards";
import { safeId } from "../util/format";

export {
  computeManifestDownloadedBytes,
  manifestPathForPartial,
  readManifestDownloadedBytes
} from "./downloadManifest";

const DOWNLOAD_TIMEOUT_MS = 4 * 60 * 60 * 1000;
const SLOW_CHECK_INTERVAL_MS = 15_000;
const READ_IDLE_TIMEOUT_MS = 30_000;
const SLOW_GRACE_BYTES = 8 * 1024 * 1024;
const MIN_BYTES_PER_SECOND = 2 * 1024 * 1024;
const MAX_SEGMENT_ATTEMPTS = 4;
const DEFAULT_CONCURRENCY = 24;
const MAX_CONCURRENCY = 32;
const DEFAULT_CHUNK_SIZE_BYTES = 64 * 1024 * 1024;
const PARALLEL_MIN_BYTES = 16 * 1024 * 1024;
const CHUNK_RETRY_BACKOFF_MS = 500;
const inFlightDownloads = new Map<string, Promise<string>>();

export interface DownloadOptions {
  concurrency?: number;
  chunkSizeBytes?: number;
  parallelMinBytes?: number;
  // Hugging Face omits an LFS oid (our sha256 source) for some siblings, so
  // integrity falls back to a byte-count match alone. Callers with a UI
  // (the extension host) should surface this where a user will see it
  // (e.g. a warning notification); a console.warn always fires regardless,
  // for the extension host's developer log.
  onChecksumWarning?: (message: string) => void;
}

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
  signal: AbortSignal,
  options: DownloadOptions = {}
): Promise<string> {
  const targetDir = path.join(modelsRoot, safeId(`${file.repoId}-${file.revision ?? "unknown-revision"}`));
  await fs.promises.mkdir(targetDir, { recursive: true });

  const targetPath = path.join(targetDir, path.basename(file.fileName));
  if (await exists(targetPath)) {
    await validateExistingFile(targetPath, file.sizeBytes, file.sha256);
    if (!file.sha256) {
      warnMissingChecksum(file.repoId, file.fileName, options.onChecksumWarning);
    }
    return targetPath;
  }

  const active = inFlightDownloads.get(targetPath);
  if (active) {
    return active;
  }

  const download = downloadGgufExclusive(file, targetPath, onProgress, signal, options);
  inFlightDownloads.set(targetPath, download);
  try {
    return await download;
  } finally {
    if (inFlightDownloads.get(targetPath) === download) {
      inFlightDownloads.delete(targetPath);
    }
  }
}

async function downloadGgufExclusive(
  file: GgufFile,
  targetPath: string,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal,
  options: DownloadOptions
): Promise<string> {
  const partialPath = `${targetPath}.part`;
  if (await exists(targetPath)) {
    await validateExistingFile(targetPath, file.sizeBytes, file.sha256);
    if (!file.sha256) {
      warnMissingChecksum(file.repoId, file.fileName, options.onChecksumWarning);
    }
    return targetPath;
  }

  const initialBytes = (await statSize(partialPath)) ?? 0;
  if (file.sizeBytes !== undefined && initialBytes > file.sizeBytes) {
    await fs.promises.rm(partialPath, { force: true });
    await fs.promises.rm(manifestPathForPartial(partialPath), { force: true });
  }

  const concurrency = clampConcurrency(options.concurrency ?? DEFAULT_CONCURRENCY);
  const chunkSizeBytes = options.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE_BYTES;
  const parallelMinBytes = options.parallelMinBytes ?? PARALLEL_MIN_BYTES;
  const startedWithPartial = ((await statSize(partialPath)) ?? 0) > 0;

  const canParallelize = file.sizeBytes !== undefined &&
    file.sizeBytes >= parallelMinBytes &&
    concurrency > 1;
  const probe = canParallelize
    ? await probeRangeSupport(file.downloadUrl, signal, file.sizeBytes)
    : { supported: false, totalBytes: file.sizeBytes };
  const totalBytes = reconcileTotalBytes(probe.totalBytes, file.sizeBytes);
  const useParallel = canParallelize && probe.supported && totalBytes !== undefined;

  if (useParallel && totalBytes !== undefined) {
    const manifestPath = manifestPathForPartial(partialPath);
    try {
      await downloadParallel({
        url: file.downloadUrl,
        partialPath,
        totalBytes,
        chunkSizeBytes,
        concurrency,
        signal,
        startedWithPartial,
        requireChunkProof: Boolean(file.sha256),
        onProgress
      });
    } catch (error) {
      if (signal.aborted || !isParallelFallbackError(error)) {
        throw error;
      }
      const manifest = await loadManifest(manifestPath);
      if (manifest) {
        await prepareSequentialFallback(partialPath, manifest);
      }
      await downloadSequential({
        file,
        partialPath,
        totalBytes,
        startedWithPartial,
        signal,
        onProgress
      });
    }
  } else {
    await downloadSequential({
      file,
      partialPath,
      totalBytes: file.sizeBytes,
      startedWithPartial,
      signal,
      onProgress
    });
  }

  const expectedSize = totalBytes ?? file.sizeBytes;
  if (expectedSize !== undefined) {
    const stat = await fs.promises.stat(partialPath);
    if (stat.size !== expectedSize) {
      throw new Error(`Downloaded size mismatch: expected ${expectedSize} bytes, got ${stat.size} bytes.`);
    }
  }
  if (file.sha256) {
    await assertSha256(partialPath, file.sha256);
  } else {
    warnMissingChecksum(file.repoId, file.fileName, options.onChecksumWarning);
  }
  await fs.promises.rm(manifestPathForPartial(partialPath), { force: true });
  await fs.promises.rename(partialPath, targetPath);
  return targetPath;
}

function reconcileTotalBytes(probeTotalBytes: number | undefined, catalogBytes: number | undefined): number | undefined {
  if (probeTotalBytes === undefined) {
    return catalogBytes;
  }
  if (catalogBytes === undefined) {
    return probeTotalBytes;
  }
  if (probeTotalBytes !== catalogBytes) {
    throw new Error(
      `Download size mismatch: server reported ${probeTotalBytes} bytes, catalog metadata says ${catalogBytes} bytes.`
    );
  }
  return catalogBytes;
}

interface SequentialDownloadOptions {
  file: GgufFile;
  partialPath: string;
  totalBytes?: number;
  startedWithPartial: boolean;
  signal: AbortSignal;
  onProgress: (progress: DownloadProgress) => void;
}

async function downloadSequential(options: SequentialDownloadOptions): Promise<void> {
  let downloadedBytes = (await statSize(options.partialPath)) ?? 0;
  let totalBytes = options.totalBytes;
  let segmentFailures = 0;
  let retrySlowStreams = true;

  while (totalBytes === undefined || downloadedBytes < totalBytes) {
    const segmentStart = downloadedBytes;

    try {
      const result = await downloadSegment({
        url: options.file.downloadUrl,
        partialPath: options.partialPath,
        start: segmentStart,
        knownTotalBytes: totalBytes,
        retrySlowStreams,
        signal: options.signal,
        onProgress: (progress) => {
          downloadedBytes = progress.downloadedBytes;
          totalBytes = progress.totalBytes;
          options.onProgress({
            ...progress,
            resumed: options.startedWithPartial || progress.resumed
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
      if (options.signal.aborted || !isRetryableSegmentError(error) || segmentFailures >= MAX_SEGMENT_ATTEMPTS - 1) {
        if (!options.signal.aborted && error instanceof SlowDownloadError && segmentFailures >= MAX_SEGMENT_ATTEMPTS - 1) {
          retrySlowStreams = false;
          segmentFailures = 0;
          continue;
        }
        throw error;
      }
      segmentFailures += 1;
    }
  }
}

interface ParallelDownloadOptions {
  url: string;
  partialPath: string;
  totalBytes: number;
  chunkSizeBytes: number;
  concurrency: number;
  signal: AbortSignal;
  startedWithPartial: boolean;
  requireChunkProof: boolean;
  onProgress: (progress: DownloadProgress) => void;
}

async function downloadParallel(options: ParallelDownloadOptions): Promise<void> {
  const manifestPath = manifestPathForPartial(options.partialPath);
  const statBeforeTruncate = (await statSize(options.partialPath)) ?? 0;
  let manifest = await loadManifest(manifestPath);
  if (
    !manifest ||
    !manifestMatchesDownload(manifest, options.totalBytes, options.chunkSizeBytes) ||
    (!options.requireChunkProof && manifest.completedChunks.length > 0 && statBeforeTruncate >= options.totalBytes)
  ) {
    manifest = createManifestFromPartial({
      partialPath: options.partialPath,
      totalBytes: options.totalBytes,
      chunkSizeBytes: options.chunkSizeBytes,
      statSize: statBeforeTruncate
    });
    await saveManifest(manifestPath, manifest);
  }

  await ensureFile(options.partialPath);
  await fs.promises.truncate(options.partialPath, options.totalBytes);

  const chunkCount = Math.ceil(options.totalBytes / options.chunkSizeBytes);
  const completed = new Set(manifest.completedChunks);
  const pending = [];
  for (let index = 0; index < chunkCount; index += 1) {
    if (!completed.has(index)) {
      pending.push(index);
    }
  }

  const poolAbort = new AbortController();
  const poolSignal = mergeAbortSignals(options.signal, poolAbort.signal);
  const activeChunkBytes = new Map<number, number>();
  let lastProgressBytes = computeManifestDownloadedBytes(manifest);
  let lastProgressTime = Date.now();
  let manifestWriteChain = Promise.resolve();

  const reportProgress = () => {
    const activeBytes = [...activeChunkBytes.values()].reduce((sum, value) => sum + value, 0);
    const downloadedBytes = computeManifestDownloadedBytes(manifest) + activeBytes;
    const now = Date.now();
    const elapsed = (now - lastProgressTime) / 1000;
    const bytesPerSecond = elapsed > 0 ? (downloadedBytes - lastProgressBytes) / elapsed : undefined;
    if (elapsed >= 1) {
      lastProgressBytes = downloadedBytes;
      lastProgressTime = now;
    }
    options.onProgress({
      downloadedBytes,
      totalBytes: options.totalBytes,
      percent: Math.min(100, (downloadedBytes / options.totalBytes) * 100),
      resumed: options.startedWithPartial,
      bytesPerSecond
    });
  };

  const queueManifestSave = () => {
    manifestWriteChain = manifestWriteChain.then(() => saveManifest(manifestPath, manifest));
    return manifestWriteChain;
  };

  reportProgress();

  let nextIndex = 0;
  const inFlight = new Map<number, Promise<void>>();

  const startChunk = (chunkIndex: number) => {
    const task = downloadChunkWithRetries({
      url: options.url,
      partialPath: options.partialPath,
      totalBytes: options.totalBytes,
      chunkSizeBytes: options.chunkSizeBytes,
      chunkIndex,
      signal: poolSignal,
      onChunkProgress: (writtenBytes) => {
        activeChunkBytes.set(chunkIndex, writtenBytes);
        reportProgress();
      }
    }).then(async () => {
      activeChunkBytes.delete(chunkIndex);
      if (!manifest.completedChunks.includes(chunkIndex)) {
        manifest.completedChunks.push(chunkIndex);
        manifest.completedChunks.sort((a, b) => a - b);
        await queueManifestSave();
      }
      reportProgress();
    }).finally(() => {
      inFlight.delete(chunkIndex);
    });
    inFlight.set(chunkIndex, task);
  };

  try {
    while (nextIndex < pending.length || inFlight.size > 0) {
      if (options.signal.aborted) {
        throw new DOMException("This operation was aborted", "AbortError");
      }
      while (nextIndex < pending.length && inFlight.size < options.concurrency) {
        startChunk(pending[nextIndex]!);
        nextIndex += 1;
      }
      if (inFlight.size === 0) {
        break;
      }
      await Promise.race(inFlight.values());
    }
    await Promise.all(inFlight.values());
    await manifestWriteChain;
  } catch (error) {
    poolAbort.abort();
    await Promise.allSettled([...inFlight.values(), manifestWriteChain]);
    throw error;
  }
}

interface ChunkDownloadOptions {
  url: string;
  partialPath: string;
  totalBytes: number;
  chunkSizeBytes: number;
  chunkIndex: number;
  signal: AbortSignal;
  onChunkProgress: (writtenBytes: number) => void;
}

async function downloadChunkWithRetries(options: ChunkDownloadOptions): Promise<void> {
  let attempts = 0;
  while (attempts < MAX_SEGMENT_ATTEMPTS) {
    try {
      await downloadChunk(options);
      return;
    } catch (error) {
      if (options.signal.aborted) {
        throw error;
      }
      attempts += 1;
      if (attempts >= MAX_SEGMENT_ATTEMPTS || !isRetryableSegmentError(error)) {
        throw error;
      }
      await sleep(CHUNK_RETRY_BACKOFF_MS * attempts);
    }
  }
}

async function downloadChunk(options: ChunkDownloadOptions): Promise<void> {
  const start = options.chunkIndex * options.chunkSizeBytes;
  const end = Math.min(start + options.chunkSizeBytes, options.totalBytes) - 1;
  const expectedBytes = end - start + 1;

  const response = await fetch(options.url, {
    headers: { range: `bytes=${start}-${end}` },
    signal: mergeAbortSignals(options.signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS))
  });
  if (response.status === 429 || response.status >= 500) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const contentRange = parseContentRange(response.headers.get("content-range"));
  if (response.status !== 206) {
    throw new Error("Parallel download requires HTTP 206 Partial Content responses.");
  }
  validateContentRange(contentRange, start);
  if (contentRange && contentRange.end !== end) {
    throw new Error(`Download response returned an unexpected byte range: ${contentRange.start}-${contentRange.end}.`);
  }

  const reader = response.body.getReader();
  const file = await fs.promises.open(options.partialPath, "r+");
  let written = 0;
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
      await file.write(value, 0, value.byteLength, start + written);
      written += value.byteLength;
      options.onChunkProgress(written);
    }
    await file.sync();
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
    await file.close();
  }

  if (written !== expectedBytes) {
    throw new Error(
      `Downloaded segment size mismatch: expected ${expectedBytes} bytes, got ${written} bytes.`
    );
  }
}

async function probeRangeSupport(
  url: string,
  signal: AbortSignal,
  knownTotalBytes?: number
): Promise<{ supported: boolean; totalBytes?: number }> {
  try {
    const response = await fetch(url, {
      headers: { range: "bytes=0-0" },
      signal: mergeAbortSignals(signal, AbortSignal.timeout(30_000))
    });
    if (response.status !== 206) {
      return { supported: false, totalBytes: knownTotalBytes };
    }
    const contentRange = parseContentRange(response.headers.get("content-range"));
    if (!contentRange?.total) {
      return { supported: false, totalBytes: knownTotalBytes };
    }
    return { supported: true, totalBytes: contentRange.total };
  } catch {
    return { supported: false, totalBytes: knownTotalBytes };
  }
}

async function prepareSequentialFallback(partialPath: string, manifest: DownloadManifest): Promise<void> {
  const resumeBytes = computeContiguousPrefixBytes(manifest);
  await fs.promises.truncate(partialPath, resumeBytes);
  await fs.promises.rm(manifestPathForPartial(partialPath), { force: true });
}

function clampConcurrency(value: number): number {
  return Math.max(1, Math.min(MAX_CONCURRENCY, Math.floor(value)));
}

function isParallelFallbackError(error: unknown): boolean {
  if (!(error instanceof Error) || /aborted/i.test(error.message)) {
    return false;
  }
  return /Parallel download requires HTTP 206|Download failed: 429|Download failed: 5/i.test(error.message) ||
    /terminated|ECONNRESET|ETIMEDOUT|EPIPE|socket|network/i.test(error.message);
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
  if (!response.ok) {
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
    reader.releaseLock();
    await file.close();
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
      /Downloaded segment size mismatch|unexpected byte range|valid Content-Range|429|5\d\d/i.test(error.message) ||
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

// Hugging Face only exposes an LFS oid (our sha256 source) for siblings
// tracked via Git LFS. A handful of small or non-standard repos omit it, in
// which case integrity falls back to a byte-count match alone. HF exposes
// no other content hash to verify against, so this can't be fixed by
// computing a checksum — it can only be made visible. console.warn covers
// the extension host's developer log; onChecksumWarning lets a caller with
// a UI (the controller) surface it somewhere a user will actually see.
function warnMissingChecksum(repoId: string, fileName: string, onChecksumWarning?: (message: string) => void): void {
  const message = `Local Motion: no SHA-256 available for ${repoId}/${fileName} (Hugging Face did not report an LFS oid). Verifying download size only.`;
  console.warn(message);
  onChecksumWarning?.(message);
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
