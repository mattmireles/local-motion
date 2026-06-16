#!/usr/bin/env bash
# Cross-agent CLI phase audit for execute-plan / phase-audit workflows.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/run-cross-agent-phase-audit.sh <plan-path> <phase-selector>

phase-selector: phase number (e.g. 2), heading slug (e.g. runtime-proxy), or
substring that uniquely matches a "## Phase ..." heading in the plan.

Artifacts:
  tmp/cross-agent-audits/phase-audit-<timestamp>/
    prompt.txt
    codex-phase-audit.md
    claude-phase-audit.md
    *.raw, *.log
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 2 ]]; then
  usage >&2
  exit 1
fi

plan_input="$1"
phase_selector="$2"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/cross-agent-review.sh
source "${script_dir}/lib/cross-agent-review.sh"

repo_root="$(cross_agent_repo_root)"
cross_agent_require_clis

if [[ "${plan_input}" = /* ]]; then
  plan_path="${plan_input}"
else
  plan_path="${repo_root}/${plan_input}"
fi

if [[ ! -f "${plan_path}" ]]; then
  echo "error: plan file not found: ${plan_path}" >&2
  exit 1
fi

plan_rel="${plan_path#"${repo_root}/"}"
output_dir="$(cross_agent_output_dir "${repo_root}" "phase-audit")"

git_slice=""
if git -C "${repo_root}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_slice="$(git -C "${repo_root}" status --short 2>/dev/null || true)"
  if [[ -z "${git_slice}" ]]; then
    git_slice="(clean working tree)"
  fi
else
  git_slice="(not a git worktree)"
fi

cat >"${output_dir}/prompt.txt" <<EOF
You are performing a phase audit for the Local Motion repository.

Local Motion is a VS Code/Cursor extension for local GGUF models and
llama-server on macOS. Canonical gates: npm run check, npm run lint, npm test.

## Active plan

Path: ${plan_rel}

\`\`\`markdown
$(cat "${plan_path}")
\`\`\`

## Phase selector

Target phase: ${phase_selector}

Isolate the matching phase section, its checked tasks, and verification text.

## Working tree snapshot

\`\`\`
${git_slice}
\`\`\`

## Your task

Read-only phase audit. Inspect implementation evidence: changed files, diffs,
tests/checks run, and linked README/Guides/Notes.

Return:

1. Findings-first, severity-ordered (P0–P3) with file references.
2. Grades A–F for Architecture, Correctness risk, and Complexity debt.
3. Explicit phase-complete vs incomplete verdict.
4. Checkbox drift between plan and code.
5. Commit readiness and verification gaps.

Do not propose patches; report only. Prefer repo ground truth over speculation.
EOF

cross_agent_run_pair "${repo_root}" "${output_dir}/prompt.txt" "${output_dir}" \
  "phase-audit"
