#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/codex/bootstrap-plan-execution.sh --plan-id <id> --plan-doc <path> --tasks-doc <path> [options]

Options:
  --output <path>      Output file path (default: docs/plan-execution/<plan-id>-task-list.md)
  --force              Overwrite output if it already exists.
  -h, --help           Show help.
USAGE
}

plan_id=""
plan_doc=""
tasks_doc=""
output_rel=""
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
    --output)
      output_rel="${2:-}"
      shift 2
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

if [[ "${plan_doc}" = /* ]]; then
  plan_doc_path="${plan_doc}"
else
  plan_doc_path="${repo_root}/${plan_doc}"
fi
if [[ "${tasks_doc}" = /* ]]; then
  tasks_doc_path="${tasks_doc}"
else
  tasks_doc_path="${repo_root}/${tasks_doc}"
fi

if [[ ! -f "${plan_doc_path}" ]]; then
  echo "Plan doc not found: ${plan_doc}" >&2
  exit 1
fi
if [[ ! -f "${tasks_doc_path}" ]]; then
  echo "Tasks doc not found: ${tasks_doc}" >&2
  exit 1
fi

if [[ -z "${output_rel}" ]]; then
  output_rel="docs/plan-execution/${plan_id}-task-list.md"
fi
if [[ "${output_rel}" = /* ]]; then
  output_path="${output_rel}"
else
  output_path="${repo_root}/${output_rel}"
fi

if [[ -f "${output_path}" && "${force}" != "true" ]]; then
  echo "Output already exists: ${output_rel}"
  echo "Re-run with --force to overwrite."
  exit 1
fi

mkdir -p "$(dirname "${output_path}")"

date_stamp="$(date +%F)"
current_section="General"
first_task=""
task_count=0

rows_file="$(mktemp)"
trap 'rm -f "${rows_file}"' EXIT

while IFS= read -r line; do
  if [[ "${line}" =~ ^##[[:space:]]+(.+)$ ]]; then
    current_section="${BASH_REMATCH[1]}"
    continue
  fi

  if [[ ! "${line}" =~ ^###[[:space:]]+([A-Za-z0-9]+\.[0-9]+).+\((P[0-9]+)\) ]]; then
    continue
  fi

  task_id="${BASH_REMATCH[1]}"
  priority="${BASH_REMATCH[2]}"
  title_raw="$(echo "${line}" | sed -E 's/^### [A-Za-z0-9]+\.[0-9]+[[:space:]]+//; s/[[:space:]]+\(P[0-9]+\).*//')"
  title="$(echo "${title_raw}" | sed -E 's/^[^[:alnum:]]+[[:space:]]*//')"

  if [[ -z "${first_task}" ]]; then
    first_task="${task_id}"
  fi

  printf '%s\t%s\t%s\t%s\n' "${priority}" "${task_id}" "${title}" "${current_section}" >> "${rows_file}"
  task_count=$((task_count + 1))
done < "${tasks_doc_path}"

if [[ ${task_count} -eq 0 ]]; then
  echo "No tasks with priority markers were parsed from ${tasks_doc}." >&2
  exit 1
fi

cat > "${output_path}" <<HEADER
# Plan Execution — ${plan_id}

## Sources
- Plan Doc: \`${plan_doc}\`
- Task Doc: \`${tasks_doc}\`
- Last Generated: ${date_stamp}

## Execution Checkpoint
- Last Completed: None
- Next Step: ${first_task}
- Open Issues: None
- Last Updated (YYYY-MM-DD): ${date_stamp}

## Ordered Task Checklist
HEADER

while IFS=$'\t' read -r priority task_id title section; do
  printf -- '- [ ] `%s` `%s` %s (Section: %s)\n' "${priority}" "${task_id}" "${title}" "${section}" >> "${output_path}"
done < "${rows_file}"

cat >> "${output_path}" <<FOOTER

## Progress Notes

- ${date_stamp}: Bootstrapped execution checklist from \`${tasks_doc}\`.
FOOTER

echo "Created ${output_rel} (${task_count} tasks)."
