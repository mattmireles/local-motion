export const LOCAL_MOTION_MODEL_ID = "Local Motion";

export type CompatibilityStatus = "compatible" | "not-compatible";

export interface MachineProfile {
  platform: NodeJS.Platform;
  arch: string;
  cpuBrand: string;
  isMac: boolean;
  isAppleSilicon: boolean;
  totalMemoryBytes: number;
  availableMemoryBytes: number;
  recommendedModelMemoryBytes: number;
  storageRoot: string;
  availableDiskBytes: number;
}

export interface GgufFile {
  repoId: string;
  fileName: string;
  sizeBytes?: number;
  sha256?: string;
  revision?: string;
  quantization: string;
  parameterCount?: number;
  downloadUrl: string;
}

export interface ModelSearchResult {
  repoId: string;
  downloads?: number;
  likes?: number;
  tags: string[];
}

export interface CompatibilityResult {
  status: CompatibilityStatus;
  requiredMemoryBytes: number;
  requiredDiskBytes: number;
  reasons: string[];
}

export interface CandidateQuantization extends GgufFile {
  compatibility: CompatibilityResult;
}

export interface InstalledModel {
  repoId: string;
  fileName: string;
  revision?: string;
  sizeBytes?: number;
  modelPath: string;
  modelId: string;
  displayName: string;
  contextTokens: number;
}

export interface DownloadedModelEntry {
  id: string;
  fileName: string;
  sizeBytes: number;
  partial: boolean;
  active: boolean;
  installed: boolean;
}

export interface RuntimeSession {
  repoId: string;
  fileName: string;
  revision?: string;
  sizeBytes?: number;
  modelPath: string;
  modelId: string;
  displayName: string;
  contextTokens: number;
  baseUrl: string;
  upstreamBaseUrl: string;
  port: number;
}

export interface RuntimeStatus {
  running: boolean;
  baseUrl?: string;
  port?: number;
  modelId?: string;
  message: string;
  /**
   * True once the local OpenAI-compatible proxy has served a real inbound
   * chat completion for this run. This is the only honest proof that a client
   * (Cursor) is actually using the local model — endpoint verification and the
   * setup-block copy do not establish it. Resets to falsy on every model
   * (re)start because the proxy is recreated per run.
   */
  clientObserved?: boolean;
}

export interface LastCopiedCursorSetup {
  baseUrl: string;
  modelId: string;
  apiKeyLabel: "local-motion";
  copiedAt: string;
  trigger: "prepareCursor" | "copySetupBlock";
  endpointVerifiedAt?: string;
}

export interface AutomagicalSetupCompletion {
  baseUrl: string;
  modelId: string;
  apiKeyLabel: "local-motion";
  cursorSetupCopiedAt: string;
  endpointVerifiedAt: string;
  completedAt: string;
}
