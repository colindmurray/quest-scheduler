#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/codex/init-plan-run.sh --plan-id <id> --plan-doc <path> --tasks-doc <path> [options]

Options:
  --archive-task-list     Archive/reset docs/task-list.md before setup.
  --execution-task-list   Output path for plan tracker (default: docs/plan-execution/<plan-id>-task-list.md)
  --prompt-file           Output path for generated prompt (default: .codex/prompts/<plan-id>-execute.md)
  --force                 Overwrite existing plan tracker and prompt.
  -h, --help              Show help.
USAGE
}

plan_id=""
plan_doc=""
tasks_doc=""
execution_task_list=""
prompt_file=""
archive_task_list="false"
force="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan-id)
      plan_id="${2:-}"
      shift 2
      ;;
    --plan-doc)
      plan_doc="${2:-}"
      shift 2
      ;;
    --tasks-doc)
      tasks_doc="${2:-}"
      shift 2
      ;;
    --execution-task-list)
      execution_task_list="${2:-}"
      shift 2
      ;;
    --prompt-file)
      prompt_file="${2:-}"
      shift 2
      ;;
    --archive-task-list)
      archive_task_list="true"
      shift
      ;;
    --force)
      force="true"
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

if [[ -z "${plan_id}" || -z "${plan_doc}" || -z "${tasks_doc}" ]]; then
  echo "Missing required arguments." >&2
  usage
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

if [[ -z "${execution_task_list}" ]]; then
  execution_task_list="docs/plan-execution/${plan_id}-task-list.md"
fi
if [[ -z "${prompt_file}" ]]; then
  prompt_file=".codex/prompts/${plan_id}-execute.md"
fi

if [[ "${archive_task_list}" == "true" ]]; then
  "${script_dir}/archive-task-list.sh" --plan-stem "${plan_id}"
fi

bootstrap_args=(
  --plan-id "${plan_id}"
  --plan-doc "${plan_doc}"
  --tasks-doc "${tasks_doc}"
  --output "${execution_task_list}"
)
if [[ "${force}" == "true" ]]; then
  bootstrap_args+=(--force)
fi
"${script_dir}/bootstrap-plan-execution.sh" "${bootstrap_args[@]}"

prompt_path="${repo_root}/${prompt_file}"
if [[ "${prompt_file}" = /* ]]; then
  prompt_path="${prompt_file}"
fi
template_path="${repo_root}/.codex/templates/local-plan-exec-prompt.md.tmpl"

if [[ ! -f "${template_path}" ]]; then
  echo "Template file not found: .codex/templates/local-plan-exec-prompt.md.tmpl" >&2
  exit 1
fi
if [[ -f "${prompt_path}" && "${force}" != "true" ]]; then
  echo "Prompt already exists: ${prompt_file}"
  echo "Re-run with --force to overwrite."
  exit 1
fi

mkdir -p "$(dirname "${prompt_path}")"

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

plan_id_esc="$(escape_sed "${plan_id}")"
plan_doc_esc="$(escape_sed "${plan_doc}")"
tasks_doc_esc="$(escape_sed "${tasks_doc}")"
exec_task_esc="$(escape_sed "${execution_task_list}")"

sed \
  -e "s/__PLAN_ID__/${plan_id_esc}/g" \
  -e "s/__PLAN_DOC__/${plan_doc_esc}/g" \
  -e "s/__TASKS_DOC__/${tasks_doc_esc}/g" \
  -e "s/__EXEC_TASK_LIST__/${exec_task_esc}/g" \
  -e "s/__EXECUTION_SKILL__/execute-local-plan/g" \
  "${template_path}" > "${prompt_path}"

echo "Created prompt: ${prompt_file}"

echo ""
echo "Next command:"
echo "  scripts/codex/run-local-plan.sh --prompt-file ${prompt_file}"
