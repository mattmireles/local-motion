import type { LocalModelOptionId } from "./models/defaultRepos";
import { normalizePublicHttpsTunnelUrl } from "./cursor/tunnelUrl";
import type { AutomagicalSetupCompletion, InstalledModel, LastCopiedCursorSetup } from "./types";

export function isLastCopiedCursorSetup(value: unknown): value is LastCopiedCursorSetup {
  if (!isRecord(value)) {
    return false;
  }

  const trigger = value.trigger;
  // Loopback / private Base URLs are pre-tunnel Plan 001 fossils. Current
  // Cursor handoff only copies public HTTPS tunnel URLs — reject the rest so
  // freshness cannot nag about a dead 127.0.0.1 copy forever.
  return isPublicHttpsCursorBaseUrl(value.baseUrl) &&
    isNonEmptyString(value.modelId) &&
    value.apiKeyLabel === "session-key" &&
    optionalNonEmptyString(value.apiKeyFingerprint) &&
    isNonEmptyString(value.copiedAt) &&
    (trigger === "prepareCursor" || trigger === "copySetupBlock") &&
    optionalNonEmptyString(value.endpointVerifiedAt);
}

export function isAutomagicalSetupCompletion(value: unknown): value is AutomagicalSetupCompletion {
  return isRecord(value) &&
    isPublicHttpsCursorBaseUrl(value.baseUrl) &&
    isNonEmptyString(value.modelId) &&
    value.apiKeyLabel === "session-key" &&
    isNonEmptyString(value.cursorSetupCopiedAt) &&
    isNonEmptyString(value.endpointVerifiedAt) &&
    isNonEmptyString(value.completedAt);
}

export function isInstalledModel(value: unknown): value is InstalledModel {
  return isRecord(value) &&
    isNonEmptyString(value.repoId) &&
    isNonEmptyString(value.fileName) &&
    optionalNumber(value.sizeBytes) &&
    optionalNonEmptyString(value.revision) &&
    isNonEmptyString(value.modelPath) &&
    isNonEmptyString(value.modelId) &&
    isNonEmptyString(value.displayName) &&
    typeof value.contextTokens === "number" &&
    Number.isFinite(value.contextTokens) &&
    value.contextTokens > 0;
}

export function isModelSlots(value: unknown): value is Partial<Record<LocalModelOptionId, InstalledModel>> {
  if (!isRecord(value)) {
    return false;
  }
  for (const [key, model] of Object.entries(value)) {
    if ((key !== "max" && key !== "mini") || !isInstalledModel(model)) {
      return false;
    }
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function optionalNonEmptyString(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value);
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function isPublicHttpsCursorBaseUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  const normalized = normalizePublicHttpsTunnelUrl(value);
  return !normalized.invalid && normalized.url !== undefined;
}
