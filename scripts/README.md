# Cross-agent audit scripts

Fresh **Codex** and **Claude Code** CLI reviewers for Local Motion workflows.
Outputs land under `tmp/cross-agent-audits/` (gitignored).

## Prerequisites

- `codex` CLI authenticated (`codex exec` works from repo root)
- `claude` CLI authenticated (`claude -p` works from repo root)
- `jq` on PATH

If `codex` fails with `unknown variant default` for `service_tier`, the shared
lib already overrides `service_tier="fast"` per run.

## Scripts

| Script | When to use |
| --- | --- |
| `run-cross-agent-plan-review.sh <plan-path>` | `create-plan` step 7 |
| `run-cross-agent-phase-audit.sh <plan-path> <phase>` | `execute-plan` step 4b |
| `run-cross-agent-audit.sh <prompt-file>` | Scoped audits (`audit-fix-loop` Part B) |

## Examples

```bash
# Review a plan draft
./scripts/run-cross-agent-plan-review.sh README/Plans/001-cursor-model-picker-setup-plan.md

# Audit phase 2 of a plan
./scripts/run-cross-agent-phase-audit.sh README/Plans/001-cursor-model-picker-setup-plan.md 2

# Custom scoped audit (write prompt first)
cat >tmp/cross-agent-audits/my-scope.txt <<'EOF'
Audit src/runtime/openAiProxy.ts for Architecture/Correctness/Complexity...
EOF
./scripts/run-cross-agent-audit.sh tmp/cross-agent-audits/my-scope.txt
```

## Artifacts

Each run creates a unique directory (via `mktemp -d`) with:

- `prompt.txt` — prompt sent to both agents
- `codex-*.md` / `claude-*.md` — final reviewer text
- `*.raw` — raw CLI stdout
- `*.log` — stderr / diagnostics

Read both markdown artifacts and integrate concrete findings. If either CLI is
missing or fails, fall back to local `audit` / `phase-audit` and note the gap.
