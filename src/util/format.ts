export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || Number.isNaN(bytes)) {
    return "Unknown";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Context windows in the familiar "128k" shape (binary k, matching how
 * model vendors label them: 131072 → "128k", 32768 → "32k").
 */
export function formatTokenWindow(tokens: number): string {
  return `${Math.floor(tokens / 1024)}k`;
}

export function safeId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

export function modelDisplayName(repoId: string, fileName: string): string {
  const repoName = repoId.split("/").pop() ?? repoId;
  return `${repoName} ${fileName.replace(/\.gguf$/i, "")}`;
}
