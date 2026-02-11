#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/codex/run-local-plan.sh --prompt-file <path> [options]

Options:
  --run-name <name>       Optional run name (default: <prompt-base>-<timestamp>).
  --model <model>         Optional model override.
  --profile <profile>     Optional Codex profile.
  --reasoning-effort <v>  Reasoning effort config (default: high; use "off" to disable).
  --sandbox <mode>        Sandbox mode (default: danger-full-access).
  --approval <policy>     Approval policy (default: never).
  --search                Enable web search.
  --verbose               Stream raw JSON events to stdout (default is human-readable output).
  --output-dir <path>     Output directory (default: .codex/runs).
  --dry-run               Print command and exit.
  -h, --help              Show help.
USAGE
}

prompt_file=""
run_name=""
model=""
profile=""
reasoning_effort="high"
sandbox_mode="danger-full-access"
approval_policy="never"
enable_search="false"
verbose_output="false"
output_dir=".codex/runs"
dry_run="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prompt-file)
      prompt_file="${2:-}"
      shift 2
      ;;
    --run-name)
      run_name="${2:-}"
      shift 2
      ;;
    --model)
      model="${2:-}"
      shift 2
      ;;
    --profile)
      profile="${2:-}"
      shift 2
      ;;
    --reasoning-effort)
      reasoning_effort="${2:-}"
      shift 2
      ;;
    --sandbox)
      sandbox_mode="${2:-}"
      shift 2
      ;;
    --approval)
      approval_policy="${2:-}"
      shift 2
      ;;
    --search)
      enable_search="true"
      shift
      ;;
    --verbose)
      verbose_output="true"
      shift
      ;;
    --output-dir)
      output_dir="${2:-}"
      shift 2
      ;;
    --dry-run)
      dry_run="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "${prompt_file}" ]]; then
  echo "--prompt-file is required." >&2
  usage
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
renderer_script="${script_dir}/render-codex-events.js"
if [[ "${prompt_file}" = /* ]]; then
  prompt_path="${prompt_file}"
else
  prompt_path="${repo_root}/${prompt_file}"
fi

if [[ ! -f "${prompt_path}" ]]; then
  echo "Prompt file not found: ${prompt_file}" >&2
  exit 1
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "codex command not found in PATH." >&2
  exit 1
fi

if [[ "${verbose_output}" != "true" ]]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "node command not found in PATH; falling back to --verbose output." >&2
    verbose_output="true"
  elif [[ ! -f "${renderer_script}" ]]; then
    echo "Renderer script not found: ${renderer_script}; falling back to --verbose output." >&2
    verbose_output="true"
  fi
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
if [[ -z "${run_name}" ]]; then
  prompt_base="$(basename "${prompt_file}")"
  prompt_base="${prompt_base%.*}"
  run_name="${prompt_base}-${timestamp}"
fi
run_name_safe="$(echo "${run_name}" | tr ' /' '--' | tr -cd '[:alnum:]_.-')"

if [[ "${output_dir}" = /* ]]; then
  output_base="${output_dir}"
else
  output_base="${repo_root}/${output_dir}"
fi

run_dir="${output_base}/${run_name_safe}"
mkdir -p "${run_dir}"

cp "${prompt_path}" "${run_dir}/prompt.md"

cmd=(codex -C "${repo_root}" -s "${sandbox_mode}" -a "${approval_policy}")
if [[ -n "${model}" ]]; then
  cmd+=(-m "${model}")
fi
if [[ -n "${profile}" ]]; then
  cmd+=(-p "${profile}")
fi
if [[ -n "${reasoning_effort}" && "${reasoning_effort}" != "off" ]]; then
  cmd+=(-c "model_reasoning_effort=\"${reasoning_effort}\"")
fi
if [[ "${enable_search}" == "true" ]]; then
  cmd+=(--search)
fi
cmd+=(exec --json -o "${run_dir}/final-message.md" -)

{
  echo "run_name=${run_name_safe}"
  echo "timestamp=${timestamp}"
  echo "prompt_file=${prompt_file}"
  echo "sandbox=${sandbox_mode}"
  echo "approval=${approval_policy}"
  echo "model=${model}"
  echo "profile=${profile}"
  echo "reasoning_effort=${reasoning_effort}"
  echo "search=${enable_search}"
  echo "verbose=${verbose_output}"
} > "${run_dir}/metadata.txt"

printf '%q ' "${cmd[@]}" > "${run_dir}/command.txt"
printf '\n' >> "${run_dir}/command.txt"

if [[ "${dry_run}" == "true" ]]; then
  echo "Run directory: ${output_dir}/${run_name_safe}"
  echo "Command:"
  cat "${run_dir}/command.txt"
  exit 0
fi

echo "Run directory: ${output_dir}/${run_name_safe}"
if [[ "${verbose_output}" == "true" ]]; then
  echo "Output mode: raw JSON events (--verbose)"
else
  echo "Output mode: human-readable (use --verbose for raw JSON)"
fi

echo "Starting local Codex run..."
set +e
if [[ "${verbose_output}" == "true" ]]; then
  "${cmd[@]}" < "${prompt_path}" | tee "${run_dir}/events.jsonl"
else
  "${cmd[@]}" < "${prompt_path}" | tee "${run_dir}/events.jsonl" | node "${renderer_script}"
fi
status=${PIPESTATUS[0]}
set -e

echo "${status}" > "${run_dir}/exit-status.txt"
if [[ ${status} -ne 0 ]]; then
  echo "Codex run exited with status ${status}." >&2
  exit ${status}
fi

if [[ ! -s "${run_dir}/final-message.md" ]]; then
  echo "Codex run ended without a final message (likely interrupted or partial)." >&2
  exit 130
fi

echo "Run completed successfully. Final message: ${output_dir}/${run_name_safe}/final-message.md"
