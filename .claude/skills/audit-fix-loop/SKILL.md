---
name: audit-fix-loop
description: >-
  Runs the full multi-agent audit workflow, fixes every issue, re-audits until
  Architecture, Correctness risk, and Complexity debt are all grade A, then runs
  the same fresh Codex + Claude CLI cross-agent review used by create-plan and
  keeps looping until both internal and external reviewers agree on A/A/A, then
  commits via git-commit. Explicitly invokes elon-musk before each audit pass.
  Use ONLY when the user explicitly invokes audit-fix-loop, $audit-fix-loop, or
  “use audit-fix-loop”—not for standalone audits, plan execution, or implicit
  routing. Does not replace phase-audit or deploy gates.
---

# Audit–Fix Loop

## Purpose

**Internal audit → fix → internal audit** until **A / A / A**, then **external
cross-agent audit → fix → repeat both gates** until **internal and external
reviewers all agree on A / A / A**, then **one final `git-commit`** for the
accumulated fixes.

No new plan-specific helper scripts. Part B reuses the shared
`scripts/run-cross-agent-audit.sh` runner and the Codex + `claude -p` execution
pattern from **`create-plan`**.

## Use When

- The user **explicitly** invokes **`audit-fix-loop`**, **`$audit-fix-loop`**,
  or clearly asks to **use audit-fix-loop** (same intent boundary as
  **`execute-plan-hardcore`**—no implicit routing).

## Do Not Use When

- The user only asked for a **read-only audit**—use **`audit`** (global skill).
- The user is **executing a checked-in plan** and wants the hardcore gate after
  plan work—prefer **`execute-plan-hardcore`**.
- A **single phase** needs plan rubric review—use **`phase-audit`**.
- Git writes are forbidden and nothing overrides that.

## Authority Model

Explicit invocation of **`audit-fix-loop`** authorizes:

- Running the full **`audit`** procedure **as part of this skill** even if the
  current message does **not** contain the substring **`audit`**—this skill is
  the explicit request for **audit and implementation fixes** until grades reach
  **A** (overrides **`audit`**'s default “surface only unless asked” rule for
  this workflow only).
- **Multiple** internal audit cycles with **multi-agent** depth per **`audit`**
  (parallel `Task` charters when the harness supports it; sequential charters
  when not).
- **Multiple** external cross-agent CLI review cycles using fresh **`codex exec`**
  and **`claude -p`** threads—the same mechanism as **`create-plan`**, not a
  separate repo script.
- **`git-commit`** once **after** **both gates** pass, following **`git-commit`**
  staging and message rules. Stage only files changed by this loop unless the
  user explicitly requests a broader commit.

If **`audit-fix-loop`** was only inferred from vague wording—**stop** before
fixes or commit and confirm intent.

## Triaging findings

Both internal and external auditors will surface findings. Before fixing
each **P0** / **P1** / **P2**, do this triage explicitly. Audit reviewers
grade *implementation of the requirement that produced the code*; they do
**not** re-derive whether the requirement should exist. The loop will spin
on the wrong axis if you skip this step.

- **Name the incident the fix prevents.** A real finding cites a measured
  incident, a reproducible failure mode, or a documented contract
  violation. A speculative finding cites precedent ("the other adapter
  does X"), parity ("missing a timeout that similar code has"), or
  defensive engineering ("could in theory burn budget"). For the second
  class, **demand a name** before fixing — what production failure, on
  what date, with what symptom, would this code have prevented? If no
  name attaches, the finding is paranoia. Treat it as a candidate for
  **deletion**, not fix.
- **Question the requirement, not just the implementation.** Apply
  `elon-musk`'s "make the requirements less dumb" pass to the underlying
  constraint — the flag, the timeout, the guard, the validation — that
  produced the code under review. If the constraint itself doesn't
  survive scrutiny, **deleting the code is the fix**.
- **Count the existing safety layers.** Reliable systems already have
  multiple defenses (platform timeouts, typed-failure cascades, client
  bounded waits, idempotency caches, retry budgets). When a finding asks
  for a new layer, count what's already there. If three layers already
  bound the failure surface, the fourth is almost always defensive
  plumbing for a hypothetical — and it usually introduces its own
  failure mode (new alerts, new tuning knobs) that didn't exist before.
- **Sunk-cost trap.** After **two** loop rounds of fixes on the same
  code surface, **stop and re-ask the requirement question** — not the
  implementation question. If multiple rounds debated whether a piece of
  code is correctly implemented, the right question may be whether the
  code should exist at all. The audit-fix-loop is structurally bad at
  surfacing this — operator must force it.

The output of triage is one of: **(a)** fix and re-audit, or **(b)**
**delete the code that produced the finding entirely** and re-audit the
simpler surface. Both are valid loop progress; (b) is often the better
move and is the one the auditors will not propose on their own.

## Procedure

### Part A — Internal audit gate

1. **Establish scope** once (whole repo, paths, diff, or feature)—same table as
   **`audit`**. State it in each audit report header. Keep this scope stable
   across both gates unless the diff or risk surface grows.

2. **`elon-musk`:** Before each audit pass (internal **and** external), **read
   and follow** [**`elon-musk`**](../elon-musk/SKILL.md). Keep deletion-first,
   Idiot Index, and pipeline-as-product pressure on **Architecture** and
   **Complexity debt** until grades reach **A**.

3. **Internal audit pass (read + grade):** Follow this repo's
   [**`audit`**](../audit/SKILL.md) skill end-to-end. For graded output and
   mechanical checks, align with
   the **`phase-audit`** skill and **`execute-plan-hardcore`** Part B:

   - **Mechanical signals** from repo root when TS/JS is in scope: at minimum
     **`npm run check`** (see root `package.json`); add **`npm run lint`** /
     **`npm test`** when the change warrants confidence. Use
     **`npm run package`** for release packaging changes.
   - Delegate **multiple readonly** charters when depth warrants it (**when in
     doubt, parallelize** per **`audit`**).
   - Merge, dedupe, assign **P0–P3** severities, and **Architecture** /
     **Correctness risk** / **Complexity debt** grades (**A–F**).

4. **Internal pass condition:** all three internal grades are **A**. If
   mechanical checks fail, treat failures as **P0** and fix before accepting
   any **A**.

5. **If any internal grade is below A:** fix **all** issues that block **A**
   (prioritize **P0**/**P1** and mechanical failures). Re-run targeted checks;
   iterate code until ready for a fresh internal audit.

6. **Internal loop:** Return to steps **2** and **3** with a **full** internal
   audit pass (not only a spot-check) until **A / A / A**. Re-scope if the diff
   or risk surface grew.

Do **not** proceed to Part B until Part A is **A / A / A**.

### Part B — External cross-agent audit gate

Run only after Part A passes in the same cycle. Reuse the shared CLI helpers in
`scripts/lib/cross-agent-review.sh` (or `scripts/run-cross-agent-audit.sh`
when the scope prompt file already exists). Do not add a plan-specific script.

1. **Write a scope prompt file** under `tmp/cross-agent-audits/` (create the
   directory with `mkdir -p` on clean checkouts) with:
   - audit scope (paths, git slice, feature name)
   - internal grades from the passing Part A pass
   - mechanical check summary
   - instruction to return **`audit`** grades (**Architecture**, **Correctness
     risk**, **Complexity debt**, **A–F**) plus severity-ordered findings

2. **Run fresh external reviewers** with the same mechanics as
   `scripts/run-cross-agent-plan-review.sh`. Prefer:

   ```bash
   scripts/run-cross-agent-audit.sh "$scope_prompt" audit
   ```

   Or invoke `codex exec` and `claude -p` inline with the same flags as
   `scripts/lib/cross-agent-review.sh` when the helper script is unavailable.
   Artifacts: `codex-audit.md`, `claude-audit.md`, plus `*.raw` and `*.log`.

3. **Require both external agents.** Codex and Claude Code must both produce
   usable audit artifacts for Part B to pass. If either CLI is missing,
   auth-failed, timed out, or returned unparsable output, run a local
   **`audit`** + **`elon-musk`** substitute to catch obvious issues, then
   **stop and ask the user** whether to retry external review or explicitly
   accept local-only substitution. Missing external review is not an A-grade.

4. **Consolidate with `elon-musk`:** After external artifacts return, apply
   step **2** again when merging external grades and findings. Prefer repo
   ground truth over reviewer speculation.

5. **External pass condition:** Codex and Claude Code both assign
   **Architecture**, **Correctness risk**, and **Complexity debt** all **A**,
   with **no P0/P1 finding** that still blocks **A**.

6. **If either external reviewer is below A or reports blocking findings:** fix
   **all** issues that block external **A**, then return to **Part A** step
   **2** with a **full** internal audit pass—not a spot-check. After Part A
   passes again, rerun Part B.

### Combined loop and finish

1. Repeat **Part A → Part B → fix → Part A → …** until **both** gates pass in
   the **same** cycle:
   - internal orchestrator: **A / A / A**
   - every successful external reviewer: **A / A / A**

2. **Stuck loop:** After complete cycles, if **A / A / A** is blocked by a
   product or architecture tradeoff on either gate, **stop**, report internal
   grades, external reviewer grades, and the blocker, and **ask the user**—do
   not spin forever.

3. **Final commit:** When both gates pass in the same cycle, run **`git-commit`**
   once for the files changed by this loop (subject/body per **`git-commit`**).
   Do not stage unrelated dirty files unless the user explicitly expands the
   commit scope.

## Boundaries

- Do **not** grade-inflate; **`audit`** rubric applies to both gates.
- Do **not** lower thresholds to reach **A**—raise quality.
- Do **not** skip Part B after Part A passes.
- Do **not** add plan-specific repo scripts for Part B; reuse
  **`scripts/run-cross-agent-audit.sh`** or the shared lib with a scoped audit
  prompt.
- Do **not** treat a failed/missing external reviewer as an automatic pass.
- Do **not** fix a finding without doing the [Triaging findings](#triaging-findings)
  pass first. The default-fix loop will spin on the wrong axis if you skip it;
  deletion is often the correct fix.
- **`git-commit`** runs **after** **both gates** pass, not after the first
  internal audit pass unless the first cycle already satisfies Part B as well.

## Relation to Other Skills

- **`elon-musk`:** Invoked **before every audit pass** (Part A and Part B
  consolidation); sharpens Architecture and Complexity grades and keeps
  deletion-first pressure on both gates.
- **`audit`:** Defines the audit procedure, charters, mechanical checks, and
  grading; **`audit-fix-loop`** adds **mandatory fix iterations**, the
  **external cross-agent gate**, and a **final commit**.
- **`create-plan`:** Owns the cross-agent CLI review contract; **`audit-fix-loop`**
  reuses that invocation pattern inline for scoped code audit—no parallel helper
  script.
- **`execute-plan-hardcore`:** Plan execution **plus** audit-to-**A** gate;
  **`audit-fix-loop`** is **only** the audit–fix–commit loop (no plan phases).
- **`git-commit`:** Final step; post-commit behavior in **`git-commit`** is
  **not** a substitute for Part A or Part B.
