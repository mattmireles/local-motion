import type { CandidateQuantization, CompatibilityResult, GgufFile, MachineProfile } from "../types";

const GIB = 1024 ** 3;

/**
 * Runtime footprint of the weights relative to GGUF file size. llama.cpp
 * mmaps the file, so weights cost ~1× the file; the extra 10% covers compute
 * buffers and allocator slack. KV cache and server overhead are added as
 * separate terms below — do not fold them back in here, that was the old
 * 1.32 multiplier double-counting ~13GB of phantom requirement on a 40GB
 * model.
 */
const MODEL_LOAD_OVERHEAD = 1.1;

export function classifyCompatibility(
  file: GgufFile,
  machine: MachineProfile,
  contextTokens: number
): CompatibilityResult {
  const estimatedModelBytes = file.sizeBytes ?? estimateModelBytes(file);
  const contextOverhead = estimateContextOverheadBytes(contextTokens, file.parameterCount);
  const serverOverhead = machine.isAppleSilicon ? 1.25 * GIB : 2 * GIB;
  const requiredMemoryBytes = Math.ceil(estimatedModelBytes * MODEL_LOAD_OVERHEAD + contextOverhead + serverOverhead);
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
          : ["Fits this Mac's memory and disk budget."]
  };
}

export function effectiveMemoryBudget(machine: MachineProfile): number {
  return machine.recommendedModelMemoryBytes;
}

export function selectBestCompatibleQuantization(candidates: CandidateQuantization[]): CandidateQuantization | undefined {
  return candidates
    .filter((candidate) => candidate.compatibility.status === "compatible")
    .sort(compareQuantizationPreference)[0];
}

/**
 * Quality floor for automagical model selection, on the
 * {@link quantizationQualityScore} scale. 40 is plain 4-bit (Q4); below that
 * (Q3/Q2/IQ3/IQ2) the quality loss outweighs a bigger model, so the ladder
 * should fall through to a smaller model that fits at a healthier quant.
 * Manual installs from Advanced are not subject to this floor.
 */
const AUTOMAGICAL_QUALITY_FLOOR = 40;

/**
 * True when a quantization is good enough to pick automatically (4-bit or
 * better). Used to skip a large model that only fits when crushed below 4-bit.
 */
export function meetsAutomagicalQualityFloor(quantization: string): boolean {
  return quantizationQualityScore(quantization) >= AUTOMAGICAL_QUALITY_FLOOR;
}

export function compareQuantizationPreference(a: CandidateQuantization, b: CandidateQuantization): number {
  if (a.compatibility.status !== b.compatibility.status) {
    return a.compatibility.status === "compatible" ? -1 : 1;
  }

  if (a.compatibility.status !== "compatible") {
    return (a.sizeBytes ?? Number.MAX_SAFE_INTEGER) - (b.sizeBytes ?? Number.MAX_SAFE_INTEGER);
  }

  const qualityDelta = quantizationQualityScore(b.quantization) - quantizationQualityScore(a.quantization);
  if (qualityDelta !== 0) {
    return qualityDelta;
  }

  const memoryDelta = a.compatibility.requiredMemoryBytes - b.compatibility.requiredMemoryBytes;
  if (memoryDelta !== 0) {
    return memoryDelta;
  }
  return (a.sizeBytes ?? Number.MAX_SAFE_INTEGER) - (b.sizeBytes ?? Number.MAX_SAFE_INTEGER);
}

export function quantizationFromFileName(fileName: string): string {
  const normalized = fileName.toUpperCase();
  const match = normalized.match(/(?:^|[-_.])(IQ\d_[A-Z0-9]+|Q\d(?:_[A-Z0-9]+)+|Q\d|F16|BF16|F32)(?:[-_.]|$)/);
  return match?.[1] ?? "Unknown";
}

/**
 * True for multi-part GGUF shard files such as `model-00001-of-00002.gguf`.
 * Local Motion only supports single-file GGUF quantizations, so shard parts are
 * excluded from candidate lists — a lone part would otherwise look like a
 * usable but broken single-file model.
 */
export function isShardedGgufFileName(fileName: string): boolean {
  return /-\d{5}-of-\d{5}\.gguf$/i.test(fileName);
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

function quantizationQualityScore(quantization: string): number {
  const q = quantization.toUpperCase();
  if (q === "F32") return 320;
  if (q === "F16" || q === "BF16") return 160;
  if (q.startsWith("Q8")) return 80;
  if (q.startsWith("Q6")) return 60;
  if (q.startsWith("Q5")) return 50 + quantizationVariantBonus(q);
  if (q.startsWith("Q4") || q.startsWith("IQ4")) return 40 + quantizationVariantBonus(q);
  if (q.startsWith("Q3") || q.startsWith("IQ3")) return 30 + quantizationVariantBonus(q);
  if (q.startsWith("Q2") || q.startsWith("IQ2")) return 20 + quantizationVariantBonus(q);
  return 0;
}

function quantizationVariantBonus(quantization: string): number {
  if (quantization.includes("_K_L")) return 0.7;
  if (quantization.includes("_K_M")) return 0.6;
  if (quantization.includes("_K_S")) return 0.4;
  if (quantization.includes("_1")) return 0.2;
  if (quantization.includes("_0")) return 0.1;
  return 0;
}

function estimateContextOverheadBytes(contextTokens: number, parameterCount?: number): number {
  const sizeFactor = Math.max(1, (parameterCount ?? 7) / 7);
  return Math.ceil((contextTokens / 8192) * sizeFactor * 0.85 * GIB);
}

function toGb(bytes: number): string {
  return (bytes / GIB).toFixed(1);
}
