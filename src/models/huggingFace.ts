import type { CandidateQuantization, GgufFile, MachineProfile } from "../types";
import { parseContentLengthHeader } from "../runtime/runtimeGuards";
import { classifyCompatibility, compareQuantizationPreference, isAuxiliaryGgufFileName, isShardedGgufFileName, quantizationFromFileName } from "./compatibility";

const HF_TIMEOUT_MS = 30_000;

interface HuggingFaceModel {
  id?: string;
  modelId?: string;
  sha?: string;
  downloads?: number;
  likes?: number;
  tags?: string[];
  siblings?: Array<{
    rfilename?: string;
    size?: number;
    lfs?: { size?: number; oid?: string };
  }>;
}

export async function listQuantizations(
  repoId: string,
  machine: MachineProfile,
  contextTokens: number
): Promise<CandidateQuantization[]> {
  const model = await fetchModelInfo(repoId);
  const files = await Promise.all((model.siblings ?? [])
    .filter((sibling) => {
      const fileName = sibling.rfilename ?? "";
      return fileName.toLowerCase().endsWith(".gguf") &&
        !isShardedGgufFileName(fileName) &&
        !isAuxiliaryGgufFileName(fileName);
    })
    .map(async (sibling): Promise<GgufFile> => {
      const fileName = sibling.rfilename ?? "";
      const revision = model.sha ?? "main";
      const url = downloadUrl(repoId, fileName, revision);
      return {
        repoId,
        fileName,
        sizeBytes: sibling.lfs?.size ?? sibling.size ?? (await readRemoteSize(url)),
        sha256: parseSha256(sibling.lfs?.oid),
        revision,
        quantization: quantizationFromFileName(fileName),
        downloadUrl: url
      };
    }));

  return files
    .map((file) => ({
      ...file,
      compatibility: classifyCompatibility(file, machine, contextTokens)
    }))
    .sort(compareQuantizationPreference);
}

async function fetchModelInfo(repoId: string): Promise<HuggingFaceModel> {
  // blobs=true makes the API include per-file size + lfs metadata, so one
  // request replaces a HEAD probe per GGUF file (~30 per repo). Fewer
  // requests means faster panel loads and far fewer transient failures.
  const response = await fetchWithTimeout(`https://huggingface.co/api/models/${repoPath(repoId)}?blobs=true`, {
    headers: { accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Could not read ${repoId}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as HuggingFaceModel;
}

async function readRemoteSize(url: string): Promise<number | undefined> {
  try {
    const response = await fetchWithTimeout(url, { method: "HEAD" });
    const rawSize = response.headers.get("content-length");
    const size = parseContentLengthHeader(rawSize);
    return response.ok && size !== undefined ? size : undefined;
  } catch {
    return undefined;
  }
}

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(HF_TIMEOUT_MS)
  });
}

function parseSha256(oid: string | undefined): string | undefined {
  if (!oid) {
    return undefined;
  }
  return oid.startsWith("sha256:") ? oid.slice("sha256:".length) : oid;
}

function downloadUrl(repoId: string, fileName: string, revision: string): string {
  return `https://huggingface.co/${repoPath(repoId)}/resolve/${encodeURIComponent(revision)}/${fileName
    .split("/")
    .map(encodeURIComponent)
    .join("/")}?download=true`;
}

function repoPath(repoId: string): string {
  return repoId.split("/").map(encodeURIComponent).join("/");
}

