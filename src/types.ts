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
  /**
   * Panel-time estimate of the largest context this machine's memory budget
   * affords for this file, capped by the `localMotion.contextTokens`
   * ceiling. Display and provisional install records only — the runtime
   * re-runs the same formula at spawn time (where `-c` is written) and
   * startInstalledModel persists what actually ran.
   */
  fittedContextTokens: number;
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
  /**
   * Before a start this is a provisional value (a candidate's panel-time fit
   * or the minimum floor); the runtime fits the real context at spawn and
   * the persisted record then carries what the server actually ran with.
   */
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
  /**
   * The --parallel value this server was spawned with. The provider divides
   * the advertised window by this, not the live setting — a mid-session
   * settings change must not misstate what the running server can hold.
   */
  parallelRequests: number;
  baseUrl: string;
  upstreamBaseUrl: string;
  apiKey: string;
  port: number;
  cursorTunnel?: CursorTunnelStatus;
}

export interface CursorTunnelStatus {
  enabled: boolean;
  source?: "managed" | "manual";
  url?: string;
  error?: "binary-missing" | "start-timeout" | "exited" | "dns-unresolved" | "invalid-url";
}

export interface RuntimeStatus {
  running: boolean;
  baseUrl?: string;
  port?: number;
  modelId?: string;
  /**
   * Per-runtime-session bearer credential for the OpenAI-compatible proxy.
   * Present only while a model is running. This value is intentionally not
   * persisted; copied setup records keep only apiKeyLabel.
   */
  apiKey?: string;
  cursorTunnel?: CursorTunnelStatus;
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
  apiKeyLabel: "session-key" | "local-motion";
  copiedAt: string;
  trigger: "prepareCursor" | "copySetupBlock";
  endpointVerifiedAt?: string;
}

export interface AutomagicalSetupCompletion {
  baseUrl: string;
  modelId: string;
  apiKeyLabel: "session-key" | "local-motion";
  cursorSetupCopiedAt: string;
  endpointVerifiedAt: string;
  completedAt: string;
}
