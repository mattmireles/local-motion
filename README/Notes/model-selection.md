# Model Selection Notes

Institutional memory for how Local Motion chooses which local coding model to
download and run. This is a design/policy note, not a debug log.

---

## Policy: biggest-first coder ladder — Active

**Last reviewed:** 2026-06-17
**Status:** Active

### Summary

Local Motion ships a curated, **biggest-capability-first** ladder of coder GGUF
repositories. `automagicalCandidate()` walks the ladder and picks the first
repo whose best compatible quantization clears a **4-bit quality floor**, so the
model auto-scales to the Mac: a large Mac runs the 30B mixture-of-experts coder;
smaller Macs fall through to the largest dense coder that still fits at Q4+. The
user never picks a model, size, or quantization on the default surface.

### The ladder (source of truth)

Defined in [`src/models/defaultRepos.ts`](src/models/defaultRepos.ts) between
the `BEGIN/END curated-ladder` markers, largest → smallest:

1. `unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF` — 30B MoE (3B active)
2. `Qwen/Qwen2.5-Coder-14B-Instruct-GGUF`
3. `Qwen/Qwen2.5-Coder-7B-Instruct-GGUF`
4. `Qwen/Qwen2.5-Coder-3B-Instruct-GGUF`
5. `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF`

(Resolved from the live ranking on 2026-06-17 by `npm run models:refresh`.)

`DEFAULT_MODEL_REPO` (and the `localMotion.defaultModelRepo` package.json
default) is ladder entry 1. A user override is tried first, then the ladder.

### Source

Seeded from the survey **<https://tomtunguz.com/local-coding-models/>** (the
consensus shifted to MoE coders — Qwen3-Coder-30B-A3B class — at ~73-77%
SWE-bench Verified, near Sonnet's ~80%). The survey gives no quantization or
hardware guidance, so the live ordering is ranked by **Hugging Face download
counts** among reputable publishers, not by the blog post.

### Key decisions

- **Aggressive default.** VS Code/Cursor extension users are power users; the
  default is the most capable model the Mac can run, not a conservative pick.
- **MoE memory math is already correct.** `classifyCompatibility` sizes on
  *total* parameters, which is right — all experts must be resident in unified
  memory even though only ~3B activate. (The `×1.32` runtime overhead is mildly
  conservative for MoE, since KV/compute scale with active params; safe.)
- **4-bit quality floor.** `meetsAutomagicalQualityFloor` (Q4 = score 40) skips
  a larger model that only fits when crushed to Q3/Q2, falling through to a
  smaller model at a healthier quant. Manual installs from Advanced are exempt.
- **Single-file only.** `isShardedGgufFileName` excludes multi-part shards
  (`*-00001-of-00002.gguf`); the target quants (Q4_K_M..Q8_0) for the shipped
  repos are single-file, so no multi-part download engine is needed. If a future
  default ships its target quant only as shards, add multi-part download support
  before adopting it.

### Maintenance: periodic re-check

The ranking moves fast, so the ladder is re-checked, not frozen:

- [`scripts/refresh-model-ranking.mjs`](scripts/refresh-model-ranking.mjs) —
  `npm run models:check` (dry-run; exits 1 on drift) and
  `npm run models:refresh` (rewrites the ladder block + package.json default).
- [`.github/workflows/model-ranking-check.yml`](.github/workflows/model-ranking-check.yml)
  runs `models:check` weekly (Mondays 14:00 UTC). On drift the job fails to
  notify a maintainer, who runs `models:refresh`, verifies with `npm test`, and
  commits.

**Supply-chain guard:** only owners on the publisher allowlist in the script
(`unsloth`, `lmstudio-community`, `bartowski`, `ggml-org`, `ggerganov`, `Qwen`,
`google`, `mlx-community`) can become a default, and a candidate must expose a
single-file Q4+ quant. Defaults are **never** auto-merged from the open internet
— the script proposes, a human applies and commits.

### Related

- [`src/models/compatibility.ts`](src/models/compatibility.ts) — quality floor,
  shard detection, compatibility/memory math.
- [`src/app/localMotionController.ts`](src/app/localMotionController.ts) —
  `automagicalCandidate()` ladder walk.
- Tests: `tests/pure-logic.test.mjs` (ladder order, quality floor, shard
  detection), `tests/extension-wiring.test.mjs` (package.json default).
