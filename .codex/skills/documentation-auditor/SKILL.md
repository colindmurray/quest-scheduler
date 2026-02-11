---
name: documentation-auditor
description: Audit older Markdown documents against git/code/docs context, re-evaluate frontmatter accuracy, and archive obsolete or deprecated docs.
---

# Documentation Auditor

Use this skill to verify whether a document's metadata is still trustworthy.

## Trigger Conditions
Run this audit when any condition is true for a non-README Markdown file:
- frontmatter `lastUpdated` is older than 30 days from the latest repo commit date, or
- the file's last commit is more than 10 commits behind `HEAD`, or
- the file's last commit date is more than 30 days older than the latest repo commit date, or
- metadata claims (`status`, `implementationStatus`) appear inconsistent with code/docs reality.

## Required Evidence Collection
1) Gather commit freshness metrics:
- `latest_repo_commit_date=$(git log -1 --format=%cs HEAD)`
- `file_last_commit_sha=$(git log -1 --format=%H -- <file>)`
- `file_last_commit_date=$(git log -1 --format=%cs -- <file>)`
- `commits_since_file_change=$(git rev-list --count ${file_last_commit_sha}..HEAD)`
2) Read the target doc fully, including frontmatter.
3) Reconcile with implementation evidence in code:
- use `rg` on feature identifiers (doc title, key terms, function names, routes, collections).
4) Reconcile with newer docs:
- check `docs/` for successor plans, decision logs, and task trackers updated later.
5) Determine whether the doc is still authoritative, partially outdated, or superseded.

## Decision Rubric
- `status: CURRENT`:
  - guidance still matches code and newer docs; no known superseding doc.
- `status: STALE`:
  - partially valid or uncertain; requires due diligence before use.
- `status: OBSOLETE`:
  - superseded, descoped, or no longer valid for current implementation.

Implementation status guidance (when applicable):
- `PENDING`: clearly not implemented yet.
- `ONGOING`: partially implemented and actively in progress.
- `COMPLETE`: implemented and reflected in code/docs.
- `DEPRECATED`: implementation path abandoned or replaced.

## Required Actions
1) Update frontmatter fields (`lastUpdated`, `status`, `implementationStatus`, `note`, `changelog`) based on evidence.
2) Add or refresh warning callouts in the doc body consistent with status.
3) If marked `OBSOLETE` or `DEPRECATED`, move the file to `docs/archived/` unless policy says otherwise.
4) Update references from active docs when archiving changes paths.

## Output Requirements
Provide a concise audit record with:
- freshness metrics (commits behind + date delta)
- evidence sources checked (code paths/docs)
- final status + implementationStatus decisions
- explicit rationale in `note`

## Guardrails
- Do not mark `COMPLETE` without direct evidence in code and/or finalized task tracking.
- If evidence is mixed, prefer `STALE` over `CURRENT`.
- If evidence is missing, document uncertainty explicitly and avoid overconfident metadata.
