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

/**
 * q8_0 KV-cache cost per context token (the runtime spawns llama-server
 * with `-ctk/-ctv q8_0`, half the f16 cost). At f16, modern local models
 * (4B–32B, all GQA) cluster between ~96KB/token (Qwen3-30B-A3B: 48 layers
 * × 4 KV heads × 128 head dim × 2 bytes × K+V) and ~262KB/token
 * (Qwen3-32B dense), with no useful correlation to total parameter count —
 * MoE decouples the two. The old params-linear scale charged a 30B MoE
 * ~466KB/token, a 5× overestimate that branded every model incompatible at
 * large context. A flat mid-class constant keeps the error within ~2×
 * either way, and llama-server remains the final arbiter at load time.
 */
const KV_CACHE_BYTES_PER_TOKEN = 96 * 1024;

/**
 * Smallest context worth running a coding agent at. Below ~32k a coding
 * agent cannot hold a real task — file contents, edits, and conversation
 * overflow immediately — so a machine that cannot fit 32k on top of the
 * weights cannot run the model, and the UI must say so rather than offer
 * a window that will only disappoint.
 */
export const MINIMUM_USABLE_CONTEXT_TOKENS = 32_768;

/**
 * Weights + server overhead — everything a model costs before the first
 * context token. The single expression both the fit and the displayed
 * requirement derive from.
 */
function baseMemoryBytes(sizeBytes: number, isAppleSilicon: boolean): number {
  const serverOverhead = isAppleSilicon ? 1.25 * GIB : 2 * GIB;
  return Math.ceil(sizeBytes * MODEL_LOAD_OVERHEAD + serverOverhead);
}

/**
 * The one context-fit formula in the codebase. Returns the largest context
 * the memory budget affords for a model file, capped by `requestedTokens`,
 * or 0 when even min(requested, {@link MINIMUM_USABLE_CONTEXT_TOKENS})
 * does not fit. Both compatibility classification and the llama-server
 * spawn (`-c`) must go through this — two fit sites was how the panel and
 * the running server learned to disagree.
 *
 * Known gap: the fit is budget-aware, not model-aware. Nothing here reads
 * the GGUF's trained context, so a small-native-context model pasted into
 * Advanced on a big Mac can be spawned past its trained window (llama-server
 * warns and runs with degraded output). The pinned pack is 256k-native, so
 * the default flow never hits this.
 */
export function fitContextTokens(
  sizeBytes: number,
  memoryBudgetBytes: number,
  isAppleSilicon: boolean,
  requestedTokens: number
): number {
  const affordableTokens = Math.floor((memoryBudgetBytes - baseMemoryBytes(sizeBytes, isAppleSilicon)) / KV_CACHE_BYTES_PER_TOKEN);
  const floorTokens = Math.min(requestedTokens, MINIMUM_USABLE_CONTEXT_TOKENS);
  return affordableTokens >= floorTokens ? Math.min(requestedTokens, affordableTokens) : 0;
}

/**
 * The `localMotion.contextTokens` setting is a ceiling, not a demand:
 * compatibility fits the largest context the memory budget affords, capped
 * by the requested value. A big cap must never brand a model incompatible —
 * that failure mode is deleted, not handled.
 */
export function classifyCompatibility(
  file: Pick<GgufFile, "sizeBytes">,
  machine: MachineProfile,
  requestedContextTokens: number
): CompatibilityResult {
  if (file.sizeBytes === undefined) {
    // No size, no estimate. The old fallback guessed 7B parameters and
    // green-lit files it knew nothing about; an honest "cannot check" beats
    // a confident lie, and sizes are near-always present via ?blobs=true.
    return {
      status: "not-compatible",
      requiredMemoryBytes: 0,
      requiredDiskBytes: 0,
      fittedContextTokens: 0,
      reasons: ["Could not read this file's size from Hugging Face, so memory fit cannot be checked. Try again."]
    };
  }

  const memoryBudget = effectiveMemoryBudget(machine);
  const floorTokens = Math.min(requestedContextTokens, MINIMUM_USABLE_CONTEXT_TOKENS);
  const fitted = fitContextTokens(file.sizeBytes, memoryBudget, machine.isAppleSilicon, requestedContextTokens);
  const memoryFits = fitted > 0;
  const fittedContextTokens = memoryFits ? fitted : floorTokens;

  const requiredMemoryBytes = baseMemoryBytes(file.sizeBytes, machine.isAppleSilicon) + fittedContextTokens * KV_CACHE_BYTES_PER_TOKEN;
  const requiredDiskBytes = Math.ceil(file.sizeBytes * 1.08 + 1 * GIB);
  const blockingReasons: string[] = [];
  const advisories: string[] = [];

  if (!machine.isMac) {
    blockingReasons.push("macOS is required for this first release.");
  }
  if (!machine.isAppleSilicon) {
    advisories.push("Apple Silicon is recommended for Metal acceleration.");
  }

  if (!memoryFits) {
    blockingReasons.push(
      `Needs about ${toGb(requiredMemoryBytes)} GB runtime memory even at a minimal ${floorTokens.toLocaleString("en-US")}-token context; available budget is ${toGb(memoryBudget)} GB.`
    );
  }
  if (requiredDiskBytes > machine.availableDiskBytes) {
    blockingReasons.push(`Needs about ${toGb(requiredDiskBytes)} GB free disk for download and install.`);
  }

  return {
    status: blockingReasons.length === 0 ? "compatible" : "not-compatible",
    requiredMemoryBytes,
    requiredDiskBytes,
    fittedContextTokens,
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

/**
 * Chooser eligibility: compatible, Q4-or-better, recognizably named. The
 * setup panel's quantization dropdown offers exactly this set, and
 * {@link chooseOptionCandidate} honors a stored pick only when it is still
 * in this set — one predicate, so the chooser can never offer (or a crafted
 * webview message select) a file the product does not stand behind.
 */
export function isChooserEligibleQuantization(candidate: CandidateQuantization): boolean {
  return candidate.compatibility.status === "compatible" &&
    candidate.quantization !== "Unknown" &&
    meetsAutomagicalQualityFloor(candidate.quantization);
}

/**
 * The chooser's candidate list: eligible files, one per quantization level.
 * The input arrives preference-sorted, so the first file for each level is
 * the best of its kind.
 */
export function chooserQuantizations(quantizations: CandidateQuantization[]): CandidateQuantization[] {
  const seen = new Set<string>();
  const choices: CandidateQuantization[] = [];
  for (const candidate of quantizations) {
    if (!isChooserEligibleQuantization(candidate) || seen.has(candidate.quantization)) {
      continue;
    }
    seen.add(candidate.quantization);
    choices.push(candidate);
  }
  return choices;
}

/**
 * Resolve the file a model option installs: the user's chooser pick when it
 * is still offered (a vanished or no-longer-eligible pick falls back
 * silently — the listing is the truth), else the automagical best gated by
 * the Q4 quality floor. Errors carry the honest blocking reason.
 */
export function chooseOptionCandidate(
  quantizations: CandidateQuantization[],
  chosenFileName: string | undefined
): CandidateQuantization | Error {
  const chosen = chosenFileName
    ? chooserQuantizations(quantizations).find((candidate) => candidate.fileName === chosenFileName)
    : undefined;
  if (chosen) {
    return chosen;
  }
  const candidate = selectBestCompatibleQuantization(quantizations);
  if (!candidate) {
    // All candidates were classified not-compatible; say why, using the
    // smallest one's blocking reason instead of a generic verdict.
    const reason = quantizations[0]?.compatibility.reasons[0];
    return new Error(reason ?? "No compatible quantization found");
  }
  if (!meetsAutomagicalQualityFloor(candidate.quantization)) {
    return new Error(`Only ${candidate.quantization} fits, below the Q4 floor`);
  }
  return candidate;
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

/**
 * True for auxiliary GGUF files that are not standalone chat models:
 * `mmproj-*` multimodal projectors (CLIP-style vision encoders shipped next
 * to vision models) and `*-MTP.gguf` multi-token-prediction heads. These are
 * small, high-precision files (e.g. mmproj-F32 at ~1GB), so left in the
 * candidate list they beat the real model on both quality score and memory
 * tiebreaks — and Local Motion would download and boot a projector as the
 * coding model.
 */
export function isAuxiliaryGgufFileName(fileName: string): boolean {
  const base = fileName.split("/").pop() ?? fileName;
  return /mmproj/i.test(base) || /-mtp\.gguf$/i.test(base);
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

function toGb(bytes: number): string {
  return (bytes / GIB).toFixed(1);
}
