#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/codex/archive-task-list.sh [options]

Options:
  --plan-stem <stem>   Optional stem in archive filename.
  --task-list <path>   Task list path (default: docs/task-list.md).
  -h, --help           Show help.
USAGE
}

plan_stem=""
task_list_rel="docs/task-list.md"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan-stem)
      plan_stem="${2:-}"
      shift 2
      ;;
    --task-list)
      task_list_rel="${2:-}"
      shift 2
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

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"

if [[ "${task_list_rel}" = /* ]]; then
  task_list_path="${task_list_rel}"
else
  task_list_path="${repo_root}/${task_list_rel}"
fi
mkdir -p "$(dirname "${task_list_path}")"
mkdir -p "${repo_root}/docs"

date_stamp="$(date +%F)"
if [[ -n "${plan_stem}" ]]; then
  archive_base="task-list-archive-${plan_stem}-${date_stamp}"
else
  archive_base="task-list-archive-${date_stamp}"
fi

archive_path="${repo_root}/docs/${archive_base}.md"
if [[ -e "${archive_path}" ]]; then
  archive_path="${repo_root}/docs/${archive_base}-$(date +%H%M%S).md"
fi

archived_rel="(none)"
if [[ -f "${task_list_path}" ]]; then
  cp "${task_list_path}" "${archive_path}"
  archived_rel="docs/$(basename "${archive_path}")"
fi

cat > "${task_list_path}" <<TASKLIST
# Quest Scheduler — Task List

## Plan Execution Checkpoint
- Last Completed: None
- Next Step: Not started
- Open Issues: None
- Last Updated (YYYY-MM-DD): ${date_stamp}

## Progress Notes

- ${date_stamp}: Archived previous task list to \`${archived_rel}\` and reset for a new long-running plan.
TASKLIST

echo "Task list reset: ${task_list_rel}"
echo "Archive file: ${archived_rel}"
