---
name: document-reviewer-expert
description: Review a design or planning document for gaps, risks, ordering, testability, and missing edge cases. Use when asked to critique a plan or spec without modifying code.
---

# Document Reviewer Expert (Gemini)

Provide a critical review of a document in this repo. Do not make code changes.

## Workflow
1) Identify the target document path (ask if missing).
2) Read the document and skim related repo context:
   - `AGENTS.md`
   - `docs/decisions.md`
   - `docs/task-list.md`
   - `docs/testing.md`
3) Evaluate for:
   - Missing steps, dependencies, and ordering risks
   - Edge cases and rollback/cleanup paths
   - Validation/testing gaps
   - Naming or terminology inconsistencies
   - Over/under‑scoped tasks
4) Produce a structured review with:
   - Summary (3–6 bullets)
   - Gaps/Risks
   - Suggested adjustments (ordered)
   - Open questions
5) Save feedback to `docs/external-feedback/gemini-document-review.md`.

## Output Rules
- Do not modify source code.
- If you must note a change, describe it in the feedback file only.
- Prefer concrete, actionable recommendations.
