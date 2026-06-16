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
}

export interface LastCopiedCursorSetup {
  baseUrl: string;
  modelId: string;
  apiKeyLabel: "local-motion";
  copiedAt: string;
  trigger: "prepareCursor" | "copySetupBlock";
  endpointVerifiedAt?: string;
}
