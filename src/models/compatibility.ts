import type { CandidateQuantization, CompatibilityResult, GgufFile, MachineProfile } from "../types";

const GIB = 1024 ** 3;

export function classifyCompatibility(
  file: GgufFile,
  machine: MachineProfile,
  contextTokens: number
): CompatibilityResult {
  const estimatedModelBytes = file.sizeBytes ?? estimateModelBytes(file);
  const contextOverhead = estimateContextOverheadBytes(contextTokens, file.parameterCount);
  const serverOverhead = machine.isAppleSilicon ? 1.25 * GIB : 2 * GIB;
  const requiredMemoryBytes = Math.ceil(estimatedModelBytes * 1.32 + contextOverhead + serverOverhead);
  const requiredDiskBytes = Math.ceil(estimatedModelBytes * 1.08 + 1 * GIB);
  const blockingReasons: string[] = [];
  const advisories: string[] = [];

  if (!machine.isMac) {
    blockingReasons.push("macOS is required for this first release.");
  }
  if (!machine.isAppleSilicon) {
    advisories.push("Apple Silicon is recommended for Metal acceleration.");
  }

  const memoryBudget = effectiveMemoryBudget(machine);
  if (requiredMemoryBytes > memoryBudget) {
    blockingReasons.push(
      `Needs about ${toGb(requiredMemoryBytes)} GB runtime memory; available budget is ${toGb(memoryBudget)} GB.`
    );
  }
  if (requiredDiskBytes > machine.availableDiskBytes) {
    blockingReasons.push(`Needs about ${toGb(requiredDiskBytes)} GB free disk for download and install.`);
  }

  return {
    status: blockingReasons.length === 0 ? "compatible" : "not-compatible",
    requiredMemoryBytes,
    requiredDiskBytes,
    reasons:
      blockingReasons.length > 0
        ? blockingReasons
        : advisories.length > 0
          ? advisories
          : ["Fits the conservative memory and disk budget for this Mac."]
  };
}

export function effectiveMemoryBudget(machine: MachineProfile): number {
  return Math.min(machine.recommendedModelMemoryBytes, machine.availableMemoryBytes);
}

export function selectBestCompatibleQuantization(candidates: CandidateQuantization[]): CandidateQuantization | undefined {
  return candidates
    .filter((candidate) => candidate.compatibility.status === "compatible")
    .sort((a, b) => {
      const memoryDelta = a.compatibility.requiredMemoryBytes - b.compatibility.requiredMemoryBytes;
      if (memoryDelta !== 0) {
        return memoryDelta;
      }
      return (a.sizeBytes ?? Number.MAX_SAFE_INTEGER) - (b.sizeBytes ?? Number.MAX_SAFE_INTEGER);
    })[0];
}

export function quantizationFromFileName(fileName: string): string {
  const normalized = fileName.toUpperCase();
  const match = normalized.match(/(?:^|[-_.])(IQ\d_[A-Z0-9]+|Q\d(?:_[A-Z0-9]+)+|Q\d|F16|BF16|F32)(?:[-_.]|$)/);
  return match?.[1] ?? "Unknown";
}

export function parameterCountFromText(text: string): number | undefined {
  const match = text.match(/(\d+(?:\.\d+)?)\s*B\b/i);
  if (!match) {
    return undefined;
  }
  return Number(match[1]);
}

function estimateModelBytes(file: GgufFile): number {
  const params = file.parameterCount ?? parameterCountFromText(`${file.repoId} ${file.fileName}`) ?? 7;
  const bits = bitsPerWeight(file.quantization);
  return Math.ceil(params * 1_000_000_000 * (bits / 8) * 1.12);
}

function bitsPerWeight(quantization: string): number {
  const q = quantization.toUpperCase();
  if (q === "F32") return 32;
  if (q === "F16" || q === "BF16") return 16;
  if (q.startsWith("Q8")) return 8;
  if (q.startsWith("Q6")) return 6;
  if (q.startsWith("Q5")) return 5;
  if (q.startsWith("Q4") || q.startsWith("IQ4")) return 4;
  if (q.startsWith("Q3") || q.startsWith("IQ3")) return 3;
  if (q.startsWith("Q2") || q.startsWith("IQ2")) return 2;
  return 5;
}

function estimateContextOverheadBytes(contextTokens: number, parameterCount?: number): number {
  const sizeFactor = Math.max(1, (parameterCount ?? 7) / 7);
  return Math.ceil((contextTokens / 8192) * sizeFactor * 0.85 * GIB);
}

function toGb(bytes: number): string {
  return (bytes / GIB).toFixed(1);
}
