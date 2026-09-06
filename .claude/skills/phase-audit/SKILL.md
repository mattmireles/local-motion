---
name: phase-audit
description: Audit a completed plan phase in this repo. Use when a phase has just been implemented and needs a findings-first review against the active plan, changed files, linked guides, and the canonical audit rubric before commit or before moving to the next phase. Explicitly invokes elon-musk for architecture and complexity scrutiny alongside the phase rubric. Do not use for implementing fixes, broad product critique, or replacing tests and CI execution.
---

# Phase Audit

## Purpose

Use this skill to audit a completed implementation phase like a skeptical
senior engineer doing code review. The job is to decide whether the phase is actually complete and ready to commit or push, not to help implement it.

## Authority Model

- This skill is **read-only** when invoked directly: report findings, grades,
  checkbox drift, and commit readiness; do not patch files.
- When embedded inside `execute-plan`, findings are handed back to
  `execute-plan`, which may fix them under that workflow's phase authority.
- When embedded inside `execute-plan-hardcore`, the parent workflow owns the
  fix-to-**A / A / A** loop after all phases are complete.

## Use When

- A plan phase was just implemented.
- The current plan checkboxes need validation against reality.
- The repo needs a findings-first review before commit or before moving to the
  next phase.

## Do Not Use When

- The request is to implement or patch code.
- The request is broad product or UX feedback.
- The request is to replace tests, CI, or runtime verification with a code
  review.

## Procedure

1. Read [references/index.md](references/index.md) first.
1b. **Read and follow [`elon-musk`](../elon-musk/SKILL.md)** before comparing
    implementation to the rubric. Use it to stress-test **unnecessary parts**,
    **heavy abstractions** (Idiot Index), **checkbox or spec baggage**, and
    **pipeline / feedback-loop** gaps—without replacing plan-scope validation.
2. Read the active plan and isolate the exact phase being audited:
   - phase goal
   - checked tasks
   - phase verification text
   - linked canonical references in [README/Guides](../../../README/Guides) and
     [README/Notes](../../../README/Notes) when notes exist
3. Inspect the implementation evidence:
   - changed files and diffs
   - tests or checks that were run
   - any notes that explain scope decisions
4. Compare the implementation against the canonical rubric and linked guides.
5. Produce a findings-first audit:
   - severity ordered
   - concrete file references when applicable
   - explicit call on whether the phase is complete
6. Explicitly check:
   - missing scope
   - missing edge cases
   - missing tests or weak verification
   - checkbox drift between the plan and the code
   - commit readiness
   - push readiness and either CI readiness or local gate readiness
   - whether **`elon-musk`** would still delete or collapse work that the phase
     left in place (flag as a finding when it indicates real debt, not mere style)
7. If there are no findings, say so directly and note residual risks or
   verification gaps.

## Output Contract

- Return the audit to the caller or chat. Do not create a routine evidence artifact, append an execution summary to the plan, or write audit output under `README/`.

- Findings first.
- Severity ordered.
- Concrete file references when applicable.
- Brief summary only after the findings.

## Boundaries

- Do not edit files.
- Do not silently fix the problem instead of reporting it.
- Do not replace tests, CI, or runtime verification with review prose.

## Canonical Docs

Read [references/index.md](references/index.md) first. It maps the workflow
guide, the audit rubric, and the repo artifacts that define whether a phase is
actually done.

## Relation to Other Skills

- **`elon-musk`:** Step 1b—same pass as **`audit`** for architecture and complexity
  pressure; read-only here (no redesign by audit).

## Handoff Rules

- Hand findings back to `execute-plan` or the user for remediation.
- `execute-plan` may invoke this same audit contract through
  `scripts/run-cross-agent-phase-audit.sh` if that helper exists. If it does not,
  run this skill locally or launch readonly Cursor subagents against the active
  phase, current repo state, recent commits, and canonical rubric.
- Re-run this skill after fixes if the phase changed materially.
