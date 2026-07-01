import type { AutomagicalSetupCompletion, LastCopiedCursorSetup } from "./types";

export function isLastCopiedCursorSetup(value: unknown): value is LastCopiedCursorSetup {
  if (!isRecord(value)) {
    return false;
  }

  const trigger = value.trigger;
  return isNonEmptyString(value.baseUrl) &&
    isNonEmptyString(value.modelId) &&
    isValidApiKeyLabel(value.apiKeyLabel) &&
    isNonEmptyString(value.copiedAt) &&
    (trigger === "prepareCursor" || trigger === "copySetupBlock") &&
    optionalNonEmptyString(value.endpointVerifiedAt);
}

export function isAutomagicalSetupCompletion(value: unknown): value is AutomagicalSetupCompletion {
  return isRecord(value) &&
    isNonEmptyString(value.baseUrl) &&
    isNonEmptyString(value.modelId) &&
    isValidApiKeyLabel(value.apiKeyLabel) &&
    isNonEmptyString(value.cursorSetupCopiedAt) &&
    isNonEmptyString(value.endpointVerifiedAt) &&
    isNonEmptyString(value.completedAt);
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

function isValidApiKeyLabel(value: unknown): value is "session-key" | "local-motion" {
  return value === "session-key" || value === "local-motion";
}
