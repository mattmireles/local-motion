/**
 * Curated one-click model ladder.
 *
 * `LocalMotionController.automagicalCandidate()` walks this list in order and
 * takes the first repository whose best compatible quantization clears the
 * automagical quality floor. The default path must not silently downgrade to
 * an older Qwen2.5 family. The only automatic fallback is Gemma 4 26B A4B:
 * current-generation, smaller than the Qwen3 default, and available as
 * single-file GGUF.
 *
 * Source and maintenance: this is an opinionated product default. Re-check
 * repo health with `npm run models:check` / `npm run models:refresh`
 * (scripts/refresh-model-ranking.mjs). Rationale and policy live in
 * README/Notes/model-selection.md.
 *
 * The refresh script rewrites ONLY the lines between the BEGIN/END markers, so
 * keep one repo id per line and keep the list ordered largest -> smallest.
 */
export const CURATED_CODER_REPOS: readonly string[] = [
  /* BEGIN curated-ladder (managed by scripts/refresh-model-ranking.mjs) */
  "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
  "unsloth/gemma-4-26B-A4B-it-GGUF"
  /* END curated-ladder */
];

/** The primary model we ship; the configured default shown in Advanced. */
export const DEFAULT_MODEL_REPO = CURATED_CODER_REPOS[0];

/** Fallback ladder used by automagical setup (see above). */
export const AUTOMAGICAL_MODEL_REPOS = CURATED_CODER_REPOS;

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
