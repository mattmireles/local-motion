export const DEFAULT_MODEL_REPO = "yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF";

export const AUTOMAGICAL_MODEL_REPOS = [
  DEFAULT_MODEL_REPO,
  "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF",
  "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF",
  "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF"
];

export function automagicalModelRepos(configuredRepo: string): string[] {
  const seen = new Set<string>();
  return [configuredRepo, ...AUTOMAGICAL_MODEL_REPOS]
    .map(normalizeHuggingFaceRepoId)
    .filter((repoId) => {
      if (repoId.length === 0 || seen.has(repoId)) {
        return false;
      }
      seen.add(repoId);
      return true;
    });
}

export function normalizeHuggingFaceRepoId(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "huggingface.co") {
      return trimmed;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.length >= 2 ? `${segments[0]}/${segments[1]}` : "";
  } catch {
    return trimmed;
  }
}
