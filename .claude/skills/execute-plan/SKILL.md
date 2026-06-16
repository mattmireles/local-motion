---
name: execute-plan
description: Execute a checked-in implementation plan for this repo phase by phase. Commits land once per completed phase locally; push and CI monitoring run once after every phase is done (not after each phase). Use when the user provides a concrete plan path and wants end-to-end implementation, phase audits, plan updates, commits, push, and CI monitoring. Do not use for creating a plan, one-off fixes without a checked-in plan, or read-only review work.
---

# Execute Plan

## Purpose

Use this skill to execute an existing repo plan without collapsing the work into
one giant unreviewed change. The unit of progress is one completed phase at a
time.

## Use When

- A concrete checked-in plan path exists in [README/Plans](../../../README/Plans).
- The plan is implementation-ready.
- The user wants the full implementation loop, not just discussion.

## Do Not Use When

- No checked-in plan exists yet.
- The request is a one-off fix without a real plan.
- The request is planning, brainstorming, or read-only review.

## Authority Model

- Explicit invocation of `$execute-plan` counts as authorization for this
  workflow's git side effects. Direct naming also counts, for example
  "use execute-plan":
  - **During phases (step 4):** narrow **phase commits** on the current branch
    only. You may **`git fetch`** and merge/rebase **locally** to integrate
    `origin/main` when needed—**do not** **`git push`** to `origin` until **all**
    phases are complete.
  - **After all phases (step 5):** one remote sync: integrate upstream, push the
    branch, monitor GitHub Actions, and fix failures until green.
- If `execute-plan` was routed implicitly or inferred rather than invoked
  directly, it may prepare local implementation work but must stop before the
  first commit or push and explain why.
- At the start of the workflow, state that `execute-plan` is running: **phase
  commits first, then a single push/CI tail**—unless the user opts out of
  remote writes.

## Procedure

1. Read [references/index.md](references/index.md) first.
2. Read the target plan and the linked canonical
   [README/Guides](../../../README/Guides) and
   [README/Notes](../../../README/Notes) before changing code.
3. Refuse to start if the plan is missing, too vague to execute honestly, or
   still requires planning work.
4. Execute one phase at a time:
   - 4a. Execute the current phase. Implement only the active phase scope.
     Make it perfect. No god modules. No bugs. Just elegant, modular code.
   - 4b. Audit the execution before the phase is marked complete or
     committed:
     - use `scripts/run-cross-agent-phase-audit.sh <plan-path> <phase-selector>`
     - this helper invokes fresh Codex and `claude -p` audit threads from the CLI
     - read the audit artifact
     - integrate concrete findings into the code and the plan
     - if the external reviewer is unavailable, fails, or times out, run the
       same rubric locally and note the missing reviewer path
   - 4c. **Plan update at phase completion.** After audit findings for this
     phase are fixed (4b), update the plan file **before** the phase commit
     (4d): check every task checkbox that belongs to the finished phase, align
     verification text with what shipped, and make it clear in the document that
     **this phase is complete**. Do not land a phase commit with that phase’s
     boxes still unchecked for work that was done, or with the plan still
     reading as if the phase is in progress when it is finished.
   - 4d. Commit only your changes. Stage only the files for the completed
     phase and write a comprehensive commit message -- include the what and
     the why.
     **Stop after the commit—do not push.** Per-phase push is an anti-pattern
     here.
5. After all phases are complete (run this block **once**, not per phase):
   - sync with `origin/main`
   - push the branch
   - monitor GitHub Actions until the run completes
   - fix regressions and repeat until green

## Worktree Rules

- Ignore unrelated dirty files unless they directly conflict with the active
  phase.
- Never revert unrelated user work.
- Stop only when an existing change creates a real safety or correctness
  conflict with the current phase.

## Audit Contract

Before each phase commit, explicitly verify:

- the phase goal is actually complete
- the CLI phase audit was integrated or its absence was called out
- the plan was updated for this phase: its checkboxes and completion state
  match the implementation (not only code—**the plan file** must show the phase
  done)
- obvious edge cases are handled
- tests or checks are appropriate for the change
- the current phase is commit-ready

## Boundaries

- Do not create a new plan inside this workflow.
- Do not silently skip the audit step.
- **Do not push to `origin` between phase commits.** Reserve the step 5
  sync/push for after every phase is implemented and committed, unless the user
  explicitly asks for a different cadence.
- Do not push with known failing CI unless the user explicitly overrides that
  rule.

## Canonical Docs

Read [references/index.md](references/index.md) first. It maps the shared
workflow guide, the phase audit rubric, and the artifacts needed to execute a
plan cleanly.

## Handoff Rules

- Hand off to `phase-audit` when clean delegated review is available.
- Hand off to `create-plan` only if the user actually needs a new plan instead
  of execution.
