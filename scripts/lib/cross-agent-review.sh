#!/usr/bin/env bash
# Shared Codex + Claude CLI cross-agent review helpers for Local Motion.
set -euo pipefail

cross_agent_repo_root() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "${script_dir}/../.." && pwd
}

cross_agent_require_command() {
  local name="$1"
  if ! command -v "${name}" >/dev/null 2>&1; then
    echo "error: required CLI not found on PATH: ${name}" >&2
    return 1
  fi
}

cross_agent_require_clis() {
  cross_agent_require_command codex
  cross_agent_require_command claude
  cross_agent_require_command jq
}

cross_agent_output_dir() {
  local repo_root="$1"
  local kind="$2"
  mkdir -p "${repo_root}/tmp/cross-agent-audits"
  mktemp -d "${repo_root}/tmp/cross-agent-audits/${kind}-XXXXXX"
}

cross_agent_run_codex() {
  local repo_root="$1"
  local prompt_file="$2"
  local output_dir="$3"
  local artifact_prefix="${4:-review}"

  local out_md="${output_dir}/codex-${artifact_prefix}.md"
  local out_raw="${output_dir}/codex-${artifact_prefix}.raw"
  local out_log="${output_dir}/codex-${artifact_prefix}.log"

  if codex exec -C "${repo_root}" --sandbox read-only \
    -c 'service_tier="fast"' \
    --output-last-message "${out_md}" \
    - <"${prompt_file}" >"${out_raw}" 2>"${out_log}"; then
    echo "codex: ok -> ${out_md}"
    return 0
  fi

  echo "codex: failed (see ${out_log})" >&2
  return 1
}

cross_agent_extract_claude_result() {
  local raw_json="$1"
  local out_md="$2"
  jq -r '
    if .is_error == true then
      "Claude review failed: " + (.result // .error // "unknown error")
    elif (.result | type) == "string" then
      .result
    elif (.result | type) == "object" then
      .result | tostring
    else
      empty
    end
  ' "${raw_json}" >"${out_md}"
}

cross_agent_run_claude() {
  local repo_root="$1"
  local prompt_file="$2"
  local output_dir="$3"
  local artifact_prefix="${4:-review}"

  local out_md="${output_dir}/claude-${artifact_prefix}.md"
  local out_raw="${output_dir}/claude-${artifact_prefix}.raw"
  local out_log="${output_dir}/claude-${artifact_prefix}.log"

  (
    cd "${repo_root}"
    claude -p --permission-mode plan \
      --tools "Read,Grep,Glob" \
      --output-format json \
      <"${prompt_file}" >"${out_raw}" 2>"${out_log}"
  )

  if ! jq -e '.subtype == "success" and (.is_error // false) == false' \
    "${out_raw}" >/dev/null 2>&1; then
    echo "claude: failed or returned error JSON (see ${out_log})" >&2
    cross_agent_extract_claude_result "${out_raw}" "${out_md}" || true
    return 1
  fi

  cross_agent_extract_claude_result "${out_raw}" "${out_md}"
  echo "claude: ok -> ${out_md}"
}

cross_agent_run_pair() {
  local repo_root="$1"
  local prompt_file="$2"
  local output_dir="$3"
  local artifact_prefix="${4:-review}"

  local codex_ok=0
  local claude_ok=0

  cross_agent_run_codex "${repo_root}" "${prompt_file}" "${output_dir}" \
    "${artifact_prefix}" &
  local codex_pid=$!

  cross_agent_run_claude "${repo_root}" "${prompt_file}" "${output_dir}" \
    "${artifact_prefix}" &
  local claude_pid=$!

  wait "${codex_pid}" || codex_ok=$?
  wait "${claude_pid}" || claude_ok=$?

  if [[ "${codex_ok}" -ne 0 || "${claude_ok}" -ne 0 ]]; then
    echo "cross-agent review incomplete: codex_exit=${codex_ok} claude_exit=${claude_ok}" >&2
    echo "artifacts: ${output_dir}" >&2
    return 1
  fi

  echo "cross-agent review complete: ${output_dir}"
}
