---
name: execute-plan-hardcore
description: >-
  Execute a checked-in implementation plan like execute-plan (phase-by-phase,
  commits, optional push/CI or local gate), then run the full audit skill on the execution scope and
  require Architecture, Correctness risk, and Complexity debt grades all A—fix
  findings and repeat until all three are A. Use when the user explicitly
  invokes this skill or wants the hardcore post-audit gate after plan execution.
  Do not use for planning-only, read-only review, or when the user wants standard
  execute-plan without the audit-to-A loop.
---

# Execute Plan (Hardcore)

## Purpose

Same end-to-end plan execution as **`execute-plan`**, plus a **mandatory
post-execution loop**: run an **audit-grade** review on the work, require **A**
grades on **all three** rubric dimensions, **fix everything** that stands in the
way, and **repeat** until those grades are **A** across the board.

## Use When

- A concrete checked-in plan path exists in [README/Plans](../../../README/Plans).
- The user explicitly invokes **`$execute-plan-hardcore`**, **use
  execute-plan-hardcore**, or otherwise clearly asks for this workflow (not
  implicit routing).
- The user wants **execute-plan** behavior **and** a full **audit** gate with
  **A / A / A** before the work is considered done.

## Do Not Use When

- No checked-in plan exists, or the request is planning-only / read-only.
- The user wants standard **`execute-plan`** without the audit-to-**A** loop—use
  **`execute-plan`**.
- The user forbids additional fix iterations after the plan is “done” by
  execute-plan alone.

## Authority Model

- Explicit invocation of **`execute-plan-hardcore`** authorizes:
  - everything **`execute-plan`** authorizes: phase commits **without** pushing
    until all phases are done, then **one** sync/push/CI tail per
    **`execute-plan`** step 5, plus follow-up fixes;
  - **after** the plan is fully executed and the **`execute-plan`** tail
    (sync, push, CI) has completed as that skill describes, **additional**
    commits and changes needed to satisfy the **post-audit** gate below;
  - running a **full graded audit pass** **as part of this skill** even though the
    user message may not contain the substring **`audit`**—this skill **is** the
    explicit request for that pass **and** for **implementation fixes** until grades
    reach **A** (overrides any default “no fixes unless asked” posture for this
    workflow only).

- If **`execute-plan-hardcore`** was only inferred or routed implicitly, stop
  before the first commit or push and explain why—same boundary as
  **`execute-plan`**.

- At workflow start, state that **`execute-plan-hardcore`** is running: phase
  commits through Part A, **then** one push/CI or local-gate tail, **then** **audit → fix →
  repeat until A/A/A** (additional commits/pushes only as needed for that
  loop—not per-phase push during Part A).

## Procedure

### Part A — Execute the plan (same as `execute-plan`)

1. Read the same primers as **`execute-plan`**:
   [execute-plan/references/index.md](../../../.claude/skills/execute-plan/references/index.md),
   the active plan, and the linked Local Motion guides.
2. Follow the **`execute-plan`** skill end-to-end: read the plan and linked
   guides/notes, one phase at a time, **`phase-audit`** per phase, **after each
   phase: update the plan—check that phase’s boxes and mark the phase
   completed in the document** (same timing as **`execute-plan`** step 4c, before
   the phase commit), narrow phase commits, then after all phases complete the
   remote sync / push / CI-or-local-gate steps spelled out in **`execute-plan`**.

Use the **`execute-plan`**
[SKILL.md](../../../.claude/skills/execute-plan/SKILL.md) as the canonical
procedure for Part A.

### Part B — Hardcore audit gate (after Part A is complete)

Run only when **all phases** are implemented, the plan reflects reality, and the
**`execute-plan`** push/CI-or-local-gate expectations are satisfied (no known
failing required check from this work unless the user explicitly overrides).

This repo ships a standalone [**`audit`**](../audit/SKILL.md) skill. Part B uses
that graded output contract: **Architecture**, **Correctness risk**, and
**Complexity debt** (A–F), with **P0/P1** findings and the **`elon-musk`** lens
for Architecture and Complexity.

1. **Scope** the audit to the **plan execution**: prefer a **`git`**-defined
   slice (e.g. merge base with `origin/main` or the branch point where this plan
   work started → `HEAD`), or the directories/files the plan touched. State the
   scope in the audit report header.

2. **Run the repo `audit` workflow** against the plan execution scope:
   - mechanical signals from repo root, adapted to the touched files;
   - multiple readonly charters when depth warrants it;
   - `elon-musk` deletion-first pressure before final Architecture and
     Complexity grades.

3. **Produce** the audit output template including **Architecture**,
   **Correctness risk**, and **Complexity debt** grades **and** findings.

4. **Pass condition:** **Architecture**, **Correctness risk**, and **Complexity
   debt** are all **A**.

5. **If any of the three grades is below A:**
   - Fix **all** issues that block raising grades to **A** (treat **P0**/**P1**
     first; do not ignore mechanical check failures).
   - Re-run relevant checks; **`git-commit`** (and push if needed) per repo
     conventions so fixes are recorded.
   - **Repeat** from step 2 (re-scope if the diff grew) until **A / A / A**.

6. **Stuck loop:** If multiple complete audit cycles still cannot reach
   **A / A / A** due to a tradeoff that needs product or architecture buy-in,
   **stop**, report grades and the blocker, and **ask the user**—do not spin
   forever.

## Worktree Rules

Same as **`execute-plan`**: ignore unrelated dirty files unless they conflict;
do not revert unrelated user work.

## Boundaries

- Do not skip Part B after Part A.
- Do not **grade inflate**; use the same honest bar as org-wide **`audit`** rubrics.
- Do not lower thresholds—**raise** code/test quality until grades merit **A**.

## Relation to Other Skills

- **`execute-plan`:** Part A is identical in intent; **`execute-plan-hardcore`**
  adds Part B only.
- **`phase-audit`:** Still used **per phase** inside Part A; Part B is broader
  after the full execution lands.

## Canonical Docs

Start with [execute-plan/references/index.md](../../../.claude/skills/execute-plan/references/index.md),
then the active plan and linked **`README/Guides`** and **`README/Notes`** when
notes exist.
