#!/usr/bin/env bash
# Cross-agent CLI review for a checked-in implementation plan draft.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/run-cross-agent-plan-review.sh <plan-path>

Reviews README/Plans/<plan>.md with Codex and Claude CLI. Artifacts:
  tmp/cross-agent-audits/plan-review-<timestamp>/
    prompt.txt
    codex-plan-review.md
    claude-plan-review.md
    *.raw, *.log
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 1
fi

plan_input="$1"
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
output_dir="$(cross_agent_output_dir "${repo_root}" "plan-review")"

cat >"${output_dir}/prompt.txt" <<EOF
You are auditing an implementation plan for the Local Motion repository.

Local Motion is a VS Code/Cursor extension that installs and runs local GGUF
coding models via llama-server on macOS. Repo gates: npm run check, npm run
lint, npm test, npm run package.

## Plan under review

Path: ${plan_rel}

\`\`\`markdown
$(cat "${plan_path}")
\`\`\`

## Your task

Perform a findings-first plan review. Read repo ground truth (README.md,
README/Guides, neighboring plans, and relevant src/ files) before grading.

Return:

1. Severity-ordered findings (P0–P3) with concrete file/path references when
   applicable.
2. Grades A–F for Architecture, Correctness risk, and Complexity debt.
3. Explicit call on whether the plan is implementation-ready.
4. Checkbox / verification gaps, missing policy, fake certainty, and open
   questions that belong in the plan.

Prefer repo evidence over speculation. Unresolved disagreements should be
listed as Open Questions, not silent passes.
EOF

cross_agent_run_pair "${repo_root}" "${output_dir}/prompt.txt" "${output_dir}" \
  "plan-review"
