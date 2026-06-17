import type { CursorSetupFreshness, CursorSetupValueKey, CursorSetupViewModel } from "./cursor/cursorIntegration";
import type { DownloadProgress } from "./runtime/downloader";
import type { CandidateQuantization, InstalledModel, ModelSearchResult, RuntimeStatus } from "./types";

export type SetupRequest =
  | { command: "ready" }
  | { command: "search"; query?: string }
  | { command: "quantizations"; repoId?: string }
  | { command: "installRun"; candidate?: CandidateQuantization }
  | { command: "automagicalSetup" }
  | { command: "stop" }
  | { command: "prepareCursor" }
  | { command: "copyCursorValue"; key?: CursorSetupValueKey };

export interface CursorActionResult {
  ok: boolean;
  message: string;
}

export interface CursorEndpointVerification extends CursorActionResult {
  type: "cursorEndpointVerification";
}

export interface CursorSettingsOpened extends CursorActionResult {
  type: "cursorSettingsOpened";
}

export interface CursorSetupPreparedResponse {
  type: "cursorSetupPrepared";
  viewModel: CursorSetupViewModel;
  cursorSetupFreshness: CursorSetupFreshness;
  verification: CursorEndpointVerification;
  copy: CursorActionResult;
  settings: CursorSettingsOpened | CursorActionResult;
}

export interface CursorCopyResult extends CursorActionResult {
  type: "cursorCopyResult";
  key: CursorSetupValueKey;
  cursorSetupFreshness: CursorSetupFreshness;
}

export interface CursorSetupPayload {
  cursorSetupViewModel: CursorSetupViewModel;
  cursorSetupFreshness: CursorSetupFreshness;
}

export interface SetupMachineView {
  cpu: string;
  arch: string;
  memory: string;
  availableMemory: string;
  budget: string;
  disk: string;
  storageRoot: string;
  appleSilicon: boolean;
}

export interface SetupStateResponse extends CursorSetupPayload {
  type: "state";
  defaultRepo: string;
  machine: SetupMachineView;
  installed?: InstalledModel;
  runtime: RuntimeStatus;
}

export interface SearchResultsResponse {
  type: "searchResults";
  results: ModelSearchResult[];
}

export interface QuantizationsResponse {
  type: "quantizations";
  repoId: string;
  quantizations: CandidateQuantization[];
}

export interface InstalledResponse extends CursorSetupPayload {
  type: "installed";
  installed: InstalledModel;
  runtime: RuntimeStatus;
  cursor?: CursorSetupPreparedResponse;
}

export interface RuntimeResponse extends CursorSetupPayload {
  type: "runtime";
  runtime: RuntimeStatus;
}

export interface AutomagicalSetupCompleteResponse extends CursorSetupPayload {
  type: "automagicalSetupComplete";
  installed?: InstalledModel;
  runtime: RuntimeStatus;
  cursor: CursorSetupPreparedResponse;
}

export type SetupResponse =
  | SetupStateResponse
  | SearchResultsResponse
  | QuantizationsResponse
  | InstalledResponse
  | RuntimeResponse
  | AutomagicalSetupCompleteResponse
  | CursorSetupPreparedResponse
  | CursorCopyResult
  | { type: "installProgress"; progress: DownloadProgress }
  | { type: "automagicalSetupStarted" }
  | { type: "error"; message: string };
