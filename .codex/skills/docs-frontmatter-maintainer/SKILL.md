---
name: docs-frontmatter-maintainer
description: Create or update frontmatter metadata for non-README Markdown files, including status, implementation status, and compact changelog entries.
---

# Docs Frontmatter Maintainer

Use this skill whenever creating or editing any Markdown file in the project (excluding `README.md` files).

## Required Frontmatter Fields
- `created` (`YYYY-MM-DD`): first creation date of the document.
- `lastUpdated` (`YYYY-MM-DD`): latest meaningful content update date.
- `summary`: 1-2 sentence scope summary.
- `category`: document type enum.
- `status`: lifecycle reliability enum.
- `note`: brief rationale for selected statuses.
- `changelog`: reverse-chronological list of short change notes.
- `implementationStatus` (required for implementation-facing docs only).

## Allowed Enums
- `category`:
  - `DESIGN_DOC`
  - `TASK_TRACKER`
  - `CORE_DOCUMENTATION`
  - `RUNBOOK`
  - `DECISION_LOG`
  - `TEST_PLAN`
  - `REFERENCE`
  - `POSTMORTEM`
  - `IMPLEMENTATION_PLAN`
  - `MIGRATION_PLAN`
  - `ARCHIVE_NOTE`
- `status`:
  - `CURRENT`
  - `STALE`
  - `OBSOLETE`
- `implementationStatus` (when applicable):
  - `PENDING`
  - `ONGOING`
  - `COMPLETE`
  - `DEPRECATED`

## When `implementationStatus` Is Required
Use `implementationStatus` for docs that represent planned or delivered implementation work, including:
- design docs
- implementation plans
- migration plans
- test plans tied to implementation rollout
- task trackers

## Workflow
1) Identify target Markdown files changed in the task (exclude `README.md` / `README*.md`).
2) For each file, preserve existing `created` if present; otherwise derive it from git history:
   - `git log --diff-filter=A --follow --format=%cs -- <file> | tail -1`
3) Set `lastUpdated` to today when content meaningfully changes.
4) Refresh `summary`, `category`, `status`, and `note` based on current document purpose.
5) Maintain concise `changelog` entries from recent history plus this change:
   - `git log --follow --format='%cs %s' -- <file>`
6) Add warning callouts near the top of the doc body:
   - `status: CURRENT` with `lastUpdated` older than 90 days -> warning to verify accuracy.
   - `status: STALE` -> warning that verification is required before use.
   - `status: OBSOLETE` or `implementationStatus: DEPRECATED` -> warning that doc is historical only.
7) Validate frontmatter consistency:
   - dates parse and `created <= lastUpdated`
   - enums are valid
   - required fields are present

## Optional Fields (Strongly Encouraged)
- `supersededBy`: path to replacement doc when obsolete.
- `reviewAfter`: date for proactive re-audit.
- `relatedDocs`: short list of key linked docs.
Use these by default when they add clarity; omit only when genuinely not applicable.

## Guardrails
- Never rewrite historical `created` unless prior value is objectively wrong.
- Keep changelog entries short and factual (single line each).
- If confidence about correctness is low, prefer `status: STALE` with explicit rationale in `note`.
