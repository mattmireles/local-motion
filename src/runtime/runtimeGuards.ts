export function parseContentLengthHeader(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isStartStale(requestedGeneration: number, currentGeneration: number): boolean {
  return requestedGeneration !== currentGeneration;
}

/**
 * The one cancellation message every aborted start path throws. The webview
 * and command handlers match it to render a user-initiated Turn Off as a
 * neutral off transition instead of a false "That did not work" alarm.
 */
export const CANCELLED_START_MESSAGE = "Local model startup was cancelled.";
