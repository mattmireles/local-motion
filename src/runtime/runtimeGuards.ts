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
