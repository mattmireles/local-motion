#!/usr/bin/env bash
# Run a scoped Codex + Claude audit from a prepared prompt file.
# Used by audit-fix-loop Part B and ad-hoc scoped audits.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/run-cross-agent-audit.sh <prompt-file> [artifact-prefix]

Runs fresh Codex and Claude CLI reviewers against the repo using the prompt
file (stdin content for both agents). Writes artifacts under:
  tmp/cross-agent-audits/audit-XXXXXX/

Optional artifact-prefix (default: audit) controls output filenames, e.g.
codex-audit.md and claude-audit.md.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 1
fi

prompt_file="$1"
artifact_prefix="${2:-audit}"

if [[ ! -f "${prompt_file}" ]]; then
  echo "error: prompt file not found: ${prompt_file}" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/cross-agent-review.sh
source "${script_dir}/lib/cross-agent-review.sh"

repo_root="$(cross_agent_repo_root)"
cross_agent_require_clis

output_dir="$(cross_agent_output_dir "${repo_root}" "audit")"
cp "${prompt_file}" "${output_dir}/prompt.txt"

cross_agent_run_pair "${repo_root}" "${output_dir}/prompt.txt" "${output_dir}" \
  "${artifact_prefix}"
