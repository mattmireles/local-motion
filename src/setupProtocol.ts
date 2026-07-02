import type { CursorSetupFreshness, CursorSetupValueKey, CursorSetupViewModel } from "./cursor/cursorIntegration";
import type { LocalModelOptionId } from "./models/defaultRepos";
import type { DownloadProgress } from "./runtime/downloader";
import type { CandidateQuantization, DownloadedModelEntry, ModelSearchResult, RuntimeStatus } from "./types";

// Single source of truth for the webview <-> extension-host message protocol.
// setupPanelHtml.ts's inline webview script cannot import this module (it
// runs in the webview, not as a compiled TS module), so it interpolates
// these values into its template literal instead of hand-duplicating the
// string literals. Renaming a value here automatically changes both sides;
// renaming a key produces a TypeScript compile error at every call site.
export const SETUP_REQUEST_COMMAND = {
  READY: "ready",
  SEARCH: "search",
  QUANTIZATIONS: "quantizations",
  INSTALL_RUN: "installRun",
  AUTOMAGICAL_SETUP: "automagicalSetup",
  STOP: "stop",
  START_DOWNLOADED_MODEL: "startDownloadedModel",
  REPLACE_MODEL_OPTION: "replaceModelOption",
  SELECT_QUANTIZATION: "selectQuantization",
  DELETE_DOWNLOADED_MODEL: "deleteDownloadedModel",
  CONNECT_CURSOR: "connectCursor",
  PREPARE_CURSOR: "prepareCursor",
  COPY_CURSOR_VALUE: "copyCursorValue"
} as const;

export const SETUP_RESPONSE_TYPE = {
  STATE: "state",
  SEARCH_RESULTS: "searchResults",
  QUANTIZATIONS: "quantizations",
  INSTALLED: "installed",
  RUNTIME: "runtime",
  AUTOMAGICAL_SETUP_COMPLETE: "automagicalSetupComplete",
  CURSOR_SETUP_PREPARED: "cursorSetupPrepared",
  CURSOR_COPY_RESULT: "cursorCopyResult",
  CURSOR_SETTINGS_OPENED: "cursorSettingsOpened",
  CURSOR_ENDPOINT_VERIFICATION: "cursorEndpointVerification",
  INSTALL_PROGRESS: "installProgress",
  INSTALL_MODEL_SELECTED: "installModelSelected",
  AUTOMAGICAL_SETUP_STARTED: "automagicalSetupStarted",
  ERROR: "error"
} as const;

export type SetupRequest =
  | { command: typeof SETUP_REQUEST_COMMAND.READY }
  | { command: typeof SETUP_REQUEST_COMMAND.SEARCH; query?: string }
  | { command: typeof SETUP_REQUEST_COMMAND.QUANTIZATIONS; repoId?: string }
  | { command: typeof SETUP_REQUEST_COMMAND.INSTALL_RUN; candidate?: CandidateQuantization }
  | { command: typeof SETUP_REQUEST_COMMAND.AUTOMAGICAL_SETUP; modelOptionId?: LocalModelOptionId }
  | { command: typeof SETUP_REQUEST_COMMAND.STOP }
  | { command: typeof SETUP_REQUEST_COMMAND.START_DOWNLOADED_MODEL; id?: string }
  | { command: typeof SETUP_REQUEST_COMMAND.REPLACE_MODEL_OPTION; modelOptionId?: LocalModelOptionId; repoId?: string }
  | { command: typeof SETUP_REQUEST_COMMAND.SELECT_QUANTIZATION; modelOptionId?: LocalModelOptionId; fileName?: string }
  | { command: typeof SETUP_REQUEST_COMMAND.DELETE_DOWNLOADED_MODEL; id?: string }
  | { command: typeof SETUP_REQUEST_COMMAND.CONNECT_CURSOR }
  | { command: typeof SETUP_REQUEST_COMMAND.PREPARE_CURSOR }
  | { command: typeof SETUP_REQUEST_COMMAND.COPY_CURSOR_VALUE; key?: CursorSetupValueKey };

export interface CursorActionResult {
  ok: boolean;
  message: string;
}

export interface CursorEndpointVerification extends CursorActionResult {
  type: typeof SETUP_RESPONSE_TYPE.CURSOR_ENDPOINT_VERIFICATION;
}

export interface CursorSettingsOpened extends CursorActionResult {
  type: typeof SETUP_RESPONSE_TYPE.CURSOR_SETTINGS_OPENED;
}

export interface CursorSetupPreparedResponse {
  type: typeof SETUP_RESPONSE_TYPE.CURSOR_SETUP_PREPARED;
  viewModel: CursorSetupViewModel;
  cursorSetupFreshness: CursorSetupFreshness;
  verification: CursorEndpointVerification;
  copy: CursorActionResult;
  settings: CursorSettingsOpened | CursorActionResult;
}

export interface CursorCopyResult extends CursorActionResult {
  type: typeof SETUP_RESPONSE_TYPE.CURSOR_COPY_RESULT;
  key: CursorSetupValueKey;
  cursorSetupFreshness: CursorSetupFreshness;
}

export interface CursorSetupPayload {
  cursorSetupViewModel: CursorSetupViewModel;
  cursorSetupFreshness: CursorSetupFreshness;
}

export interface SetupStoragePayload {
  downloadedModels: DownloadedModelEntry[];
  downloadedModelsSizeBytes: number;
}

/**
 * One entry in a model option's quantization chooser. The label is
 * preformatted host-side ("Q8_0 · 34.9 GB · 128k context") so the webview
 * stays a dumb renderer of consequences, not a calculator of them.
 */
export interface SetupQuantizationChoiceView {
  fileName: string;
  quantization: string;
  label: string;
}

export interface SetupModelOptionView {
  id: LocalModelOptionId;
  label: string;
  modelName: string;
  summary: string;
  repoId: string;
  status: "checking" | "available" | "downloaded" | "running" | "unavailable";
  fileName?: string;
  quantization?: string;
  downloadSize?: string;
  requiredMemory?: string;
  /** The context window this Mac gets for the selected file, e.g. "128k". */
  contextWindow?: string;
  /** Compatible quantizations to choose from; present only before download. */
  quantizationChoices?: SetupQuantizationChoiceView[];
  downloadedModelId?: string;
  statusText: string;
}

export interface SetupModelOptionsPayload {
  modelOptions: SetupModelOptionView[];
  selectedModelOptionId: LocalModelOptionId;
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

export interface SetupInstalledModelView {
  displayName: string;
}

export interface SetupStateResponse extends CursorSetupPayload, SetupStoragePayload, SetupModelOptionsPayload {
  type: typeof SETUP_RESPONSE_TYPE.STATE;
  defaultRepo: string;
  machine: SetupMachineView;
  installed?: SetupInstalledModelView;
  runtime: RuntimeStatus;
}

export interface SearchResultsResponse {
  type: typeof SETUP_RESPONSE_TYPE.SEARCH_RESULTS;
  results: ModelSearchResult[];
}

export interface QuantizationsResponse {
  type: typeof SETUP_RESPONSE_TYPE.QUANTIZATIONS;
  repoId: string;
  quantizations: CandidateQuantization[];
}

export interface InstalledResponse extends CursorSetupPayload, SetupStoragePayload, SetupModelOptionsPayload {
  type: typeof SETUP_RESPONSE_TYPE.INSTALLED;
  installed: SetupInstalledModelView;
  runtime: RuntimeStatus;
  cursor?: CursorSetupPreparedResponse;
}

export interface RuntimeResponse extends CursorSetupPayload, SetupStoragePayload, SetupModelOptionsPayload {
  type: typeof SETUP_RESPONSE_TYPE.RUNTIME;
  runtime: RuntimeStatus;
}

export interface AutomagicalSetupCompleteResponse extends CursorSetupPayload, SetupStoragePayload, SetupModelOptionsPayload {
  type: typeof SETUP_RESPONSE_TYPE.AUTOMAGICAL_SETUP_COMPLETE;
  installed?: SetupInstalledModelView;
  runtime: RuntimeStatus;
  cursor?: CursorSetupPreparedResponse;
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
  | { type: typeof SETUP_RESPONSE_TYPE.INSTALL_PROGRESS; progress: DownloadProgress; modelName?: string }
  | { type: typeof SETUP_RESPONSE_TYPE.INSTALL_MODEL_SELECTED; modelName: string; requiredMemory: string; availableMemory: string }
  | { type: typeof SETUP_RESPONSE_TYPE.AUTOMAGICAL_SETUP_STARTED }
  | { type: typeof SETUP_RESPONSE_TYPE.ERROR; message: string };
