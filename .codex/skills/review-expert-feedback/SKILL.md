---
name: review-expert-feedback
description: Critically evaluate expert feedback files against a target document and repo context, extracting only high-value, practical insights while avoiding YAGNI and cost-heavy changes. Use after Claude/Gemini reviews of a plan or task list.
---

# Review Expert Feedback

Use this skill to vet external expert feedback (e.g., Claude/Gemini) against the repo and a target document. The goal is to extract **gold nuggets** while rejecting flawed, overcomplicated, or cost‑heavy advice.

## Required Inputs
- Target document path (plan or task list)
- One or more expert feedback files
- Repo root context (read relevant docs as needed)

## Principles
- **Do not trust feedback by default.** Validate against repo/docs and the project’s goals.
- **Small project reality:** ~10 users, free GCP quotas. Avoid suggestions that add cost, ops burden, or premature scaling.
- **Avoid YAGNI:** Only accept changes that materially improve robustness, clarity, or correctness.
- **Prefer forward‑looking but lean:** Design for growth without over‑engineering.

## Workflow
1) **Load context:** Read the target document and the feedback files. Skim relevant repo docs to verify claims.
2) **Extract claims:** List each actionable suggestion or risk from feedback.
3) **Validate:** For each claim, mark as:
   - **Accept** (clearly correct, high value, low cost)
   - **Defer** (nice to have, not needed now)
   - **Reject** (incorrect, risky, over‑engineered, or costly)
4) **Gold nuggets:** Identify any overlooked, high‑impact gaps and highlight them separately.
5) **Apply changes:** If Accept items imply doc changes, update the target document and/or task list.
6) **Record decisions:** Add any non‑obvious decisions to `docs/decisions.md`.
7) **Summarize:** Provide a short report with accepted/deferred/rejected items and rationale.

## Output Expectations
- A concise verdict table: suggestion → decision → rationale.
- A short list of gold nuggets (if any).
- Updated target doc when warranted, otherwise state “no changes.”

## Guardrails
- Do **not** introduce costs (paid services, infra, or heavy tooling) without strong justification.
- Do **not** recommend changes that require large rewrites unless they solve a current blocker.
- Keep language and scope aligned with the existing plan format.
