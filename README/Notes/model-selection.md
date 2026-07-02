# Model Selection Notes

Institutional memory for how Local Motion chooses which local coding model to
download and run. This is a design/policy note, not a debug log.

---

## Policy: Max + Mini model pack — Active

**Last reviewed:** 2026-06-17
**Status:** Active

### Summary

Local Motion ships a fixed two-model one-click setup pack: **Max** is
Qwen3-Coder-30B-A3B, and **Mini** is Gemma 4 26B A4B. Setup picks the best
compatible Q4+ quantization for each model, preinstalls both when they fit, and
starts the selected option. The default path must not silently downgrade to the
older Qwen2.5 family. Smaller or older models are explicit Advanced choices.

### The ladder (source of truth)

Defined in [`src/models/defaultRepos.ts`](src/models/defaultRepos.ts) between
the `BEGIN/END curated-ladder` markers:

1. `unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF` — 30B MoE (3B active)
2. `unsloth/gemma-4-26B-A4B-it-GGUF` — 26B MoE (4B active)

(Resolved from the live ranking on 2026-06-17 by `npm run models:refresh`.)

`DEFAULT_MODEL_REPO` (and the `localMotion.defaultModelRepo` package.json
default) remains the Advanced repository default. One-click setup uses the
fixed Max + Mini pack.

### Source

Seeded from the survey **<https://tomtunguz.com/local-coding-models/>** (the
consensus shifted to MoE coders — Qwen3-Coder-30B-A3B class — at ~73-77%
SWE-bench Verified, near Sonnet's ~80%). The survey gives no quantization or
hardware guidance, so the live ordering is ranked by **Hugging Face download
counts** among reputable publishers, not by the blog post.

### Key decisions

- **Aggressive default.** VS Code/Cursor extension users are power users; the
  default is Qwen3-Coder, not a conservative Qwen2.5 fallback.
- **Gemma 4 26B Mini.** Gemma 4 31B and 26B are both available as GGUF.
  31B is not useful as a fallback because it is effectively in the same memory
  tier as Qwen3-Coder-30B-A3B. Gemma 4 26B A4B is the smaller current-generation
  Mini.
- **Preinstall both.** The one-click path downloads the best compatible Qwen3
  quant and the best compatible Gemma 4 26B quant, then starts the selected
  option. The user can switch between Max and Mini without another network wait.
- **Slots are replaceable.** Max and Mini have default repos, but users can
  paste a different Hugging Face GGUF repo into either slot. Replacement uses
  the same compatibility, Q4+ floor, resumable download, and slot persistence as
  the default pack.
- **Weights are sized from the real file, KV from a flat per-token constant.**
  `classifyCompatibility` charges the GGUF file size ×1.1 (mmap'd weights plus
  compute buffers) — right for MoE too, since all experts must be resident in
  unified memory even though only ~3-4B activate. KV cache is a flat
  96KB/token (q8_0 cache — the spawn passes `-ctk/-ctv q8_0`, half the f16
  cost): at f16, modern GQA models cluster ~96-262KB/token with no useful
  correlation to total parameter count, and the old params-linear scale
  overcharged a 30B MoE ~5×, branding every model incompatible at large
  context (see the 2026-07-02 issue below).
- **`localMotion.contextTokens` is a ceiling, not a demand.** The runtime fits
  the largest context the memory budget affords at spawn time
  (`fitContextTokens`, applied in `LlamaServerManager` where `-c` is written),
  capped by the setting. A big cap can never brand a model incompatible; only
  "cannot fit even 32k tokens" blocks.
- **Each model card shows its context window and a quantization chooser.**
  The card meta reads "Q8_0 · 128k context · 30.3 GB download"; before
  download, a per-card dropdown lists compatible Q4+ quantizations, each
  labeled with the context window this Mac would get, so the quality/context
  trade is legible on machines where they compete. The choice is
  session-scoped (`selectQuantization`); the downloaded file is the durable
  record.
- **4-bit quality floor.** `meetsAutomagicalQualityFloor` (Q4 = score 40) keeps
  the one-click path from selecting a badly crushed quantization. Manual
  installs from Advanced are exempt.
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
  `automagicalCandidates()` fixed Max + Mini pack selection.
- Tests: `tests/pure-logic.test.mjs` (ladder order, quality floor, shard
  detection), `tests/extension-wiring.test.mjs` (package.json default).

---

## Issue: Params-Linear KV Estimate Branded Every Model Incompatible — Resolved

**First spotted:** 2026-07-02
**Resolved:** 2026-07-02
**Status:** Resolved

### Symptom

With `localMotion.contextTokens: 131072`, both Max and Mini read "Needs about
67.7 GB runtime memory; available budget is 51.2 GB" on a 64GB M2 Ultra —
every quantization of both pinned repos classified not-compatible, setup
dead-ended.

### Root Cause

Three compounding defects. (1) The KV-cache estimate scaled linearly with
*total* parameter count (`(tokens/8192) × (params/7) × 0.85GiB`), charging
Qwen3-Coder-30B-A3B ~58GB of phantom KV at 131k tokens; the real GQA cost is
~96KB/token ≈ 12.6GB. (2) The setting was a hard demand: if the requested
context did not fit, the model was "not compatible" rather than fitted to a
smaller context. (3) The fit later lived in three controller sites plus the
raw setting reaching `-c`, so the panel, persisted state, and the running
server could each believe a different number.

### Fix

`fitContextTokens` in `src/models/compatibility.ts` is the single fit formula:
flat 96KB/token KV (q8_0 cache), floor 32768 (below ~32k a coding agent
cannot hold a real task, so the model reads as incompatible), capped by the
(clamped) setting.
`classifyCompatibility` consumes it for verdicts; `LlamaServerManager` applies
it where `-c` is written, so every start path — panel, model switch, provider
lazy start, Connect Cursor restart — is fitted by construction, and
`startInstalledModel` persists exactly what ran. The 7B-default size-estimate
fallback (`estimateModelBytes`/`parameterCount`) was deleted: unknown size is
an honest not-compatible. The provider advertises one slot's window (minus
the output reservation) because llama-server splits `-c` across `--parallel`
slots.

To meet the ≥128k-context requirement on a 64GB Mac at Q8 weights, the spawn
uses `-ctk/-ctv q8_0` with `-fa on` (halves KV memory; V-quant requires flash
attention) and `parallelRequests` defaults to 1 (a second slot silently
halves every request's window; extra requests queue instead).

**Accepted trade (2026-07-02, external audit P2):** the flat 96KB/token
constant is tuned to the MoE end of the class; a large *dense* model (e.g.
Qwen3-32B at ~262KB/token f16 ≈ 131KB/token q8_0) pasted into Advanced can
classify compatible at a context whose real KV busts the budget, failing at
load with the memory hint. Raising the constant would cost the all-MoE
default pack its 128k window — the product requirement — so the constant
stays MoE-tuned and llama-server remains the final arbiter for Advanced
installs. Revisit only if a dense model enters the default pack.

### Executable Memory

Regression test: `tests/pure-logic.test.mjs` — "a max contextTokens cap
shrinks context to fit instead of branding the Mac incompatible", "an unknown
file size is an honest not-compatible, never a guessed green light".
Regression test: `tests/extension-wiring.test.mjs` — "the runtime owns the
context fit; no start path can pass the raw setting to -c".
