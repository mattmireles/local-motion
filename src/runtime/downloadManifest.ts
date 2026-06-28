import * as fs from "node:fs";

export const MANIFEST_VERSION = 1;

export interface DownloadManifest {
  version: typeof MANIFEST_VERSION;
  totalBytes: number;
  chunkSizeBytes: number;
  completedChunks: number[];
}

export function manifestPathForPartial(partialPath: string): string {
  return `${partialPath}.json`;
}

export function computeManifestDownloadedBytes(manifest: DownloadManifest): number {
  const chunkCount = Math.ceil(manifest.totalBytes / manifest.chunkSizeBytes);
  let bytes = 0;
  for (const index of manifest.completedChunks) {
    if (index < 0 || index >= chunkCount) {
      continue;
    }
    const start = index * manifest.chunkSizeBytes;
    const end = Math.min(start + manifest.chunkSizeBytes, manifest.totalBytes);
    bytes += end - start;
  }
  return bytes;
}

/** Longest byte prefix covered by completed chunks 0..N with no gaps. */
export function computeContiguousPrefixBytes(manifest: DownloadManifest): number {
  const sorted = [...new Set(manifest.completedChunks)].sort((a, b) => a - b);
  let prefixBytes = 0;
  for (let expected = 0; expected < sorted.length; expected += 1) {
    if (sorted[expected] !== expected) {
      break;
    }
    const start = expected * manifest.chunkSizeBytes;
    prefixBytes = Math.min(start + manifest.chunkSizeBytes, manifest.totalBytes);
  }
  return prefixBytes;
}

export function isValidManifest(manifest: DownloadManifest | undefined): manifest is DownloadManifest {
  if (!manifest || manifest.version !== MANIFEST_VERSION || !Array.isArray(manifest.completedChunks)) {
    return false;
  }
  if (!Number.isFinite(manifest.totalBytes) || manifest.totalBytes <= 0) {
    return false;
  }
  if (!Number.isFinite(manifest.chunkSizeBytes) || manifest.chunkSizeBytes <= 0) {
    return false;
  }
  return manifest.completedChunks.every((index) => {
    if (!Number.isInteger(index) || index < 0) {
      return false;
    }
    const chunkCount = Math.ceil(manifest.totalBytes / manifest.chunkSizeBytes);
    return index < chunkCount;
  });
}

export function manifestMatchesDownload(
  manifest: DownloadManifest,
  totalBytes: number,
  chunkSizeBytes: number
): boolean {
  return manifest.totalBytes === totalBytes && manifest.chunkSizeBytes === chunkSizeBytes;
}

export async function readManifestDownloadedBytes(partialPath: string): Promise<number | undefined> {
  const manifest = await loadManifest(manifestPathForPartial(partialPath));
  if (!manifest) {
    return undefined;
  }
  return computeManifestDownloadedBytes(manifest);
}

export async function loadManifest(manifestPath: string): Promise<DownloadManifest | undefined> {
  try {
    const raw = await fs.promises.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw) as DownloadManifest;
    if (!isValidManifest(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function saveManifest(manifestPath: string, manifest: DownloadManifest): Promise<void> {
  await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest)}\n`, "utf8");
}

export function createManifestFromPartial(input: {
  partialPath: string;
  totalBytes: number;
  chunkSizeBytes: number;
  statSize: number;
}): DownloadManifest {
  let prefixBytes = input.statSize;
  // A sparse pre-allocated file reports full size but is mostly holes.
  if (prefixBytes >= input.totalBytes) {
    prefixBytes = 0;
  }

  const chunkCount = Math.ceil(input.totalBytes / input.chunkSizeBytes);
  const completedChunks: number[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const chunkEnd = Math.min((index + 1) * input.chunkSizeBytes, input.totalBytes);
    if (prefixBytes >= chunkEnd) {
      completedChunks.push(index);
    }
  }
  return {
    version: MANIFEST_VERSION,
    totalBytes: input.totalBytes,
    chunkSizeBytes: input.chunkSizeBytes,
    completedChunks
  };
}
