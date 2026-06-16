---
name: audit
description: Triggered when the user’s message includes the word **audit** (primary routing hook). Findings-first review of the Local Motion repo or a scoped slice (paths, diff, commits)—runs repo-appropriate mechanical signals, **reads and applies [`elon-musk`](../elon-musk/SKILL.md)** for first-principles systems judgment on architecture and complexity, optionally delegates readonly subagents by charter when scope or risk warrants it (**when in doubt, parallelize**), merges and dedupes findings, and assigns A–F grades for architecture, correctness risk, and complexity debt. Do not use when the user wants implementation fixes unless they explicitly ask to fix issues after the audit—for gating a plan phase, use phase-audit.
---

# Audit

## Purpose

Run a **structured, paranoid-friendly** audit focused on **bugs** and **needless complexity**. The orchestrator **does not** silently rewrite code; it **surfaces**
issues with severity, paths, and letter grades.

**Posture:** use **judgment**. **Before consolidation and grading, read
[`elon-musk`](../elon-musk/SKILL.md)** and use its algorithm (question requirements, delete
before simplify, Idiot Index / local maxima, pipeline as product) when forming
**Architecture** and **Complexity debt** findings and grades. Narrative
correctness and async discipline stay on the main audit charter; the **elon-musk** lens
sharpens whether structure is *right*, not just *tidy*.

Narrow scope (few files, small diff, localized
change) can be a **single-agent** pass. **Whole-repo**, **large diff**, **high
blast radius**, or **you are unsure** → prefer **multiple readonly passes** with
**narrow charters** (parallel when the harness supports it—see
[Harness compatibility](#harness-compatibility)), then **merge and dedupe** into
one report. **When in doubt, use multiple passes.**

## Use When

- The user’s message includes **`audit`** as a substring (primary trigger)—e.g.
  **audit**, **audit this**, **security audit**, **use the audit skill** (case
  insensitive in normal routing).

## Do Not Use When

- The user wants **implementation** only—unless they ask for fixes **after**
  the audit lands.
- The work is **only** gating an `execute-plan` phase (plan checklist + **A / A / A**
  for the phase surface)—use **`phase-audit`** instead (this skill is broader and
  read-only by default).

## Scope (ask or infer once)

Establish **audit scope** before delegating:

| Kind | How to bound |
| --- | --- |
| **Whole codebase** | Repo root; subagents apportion by `src/`, `tests/`, docs, or by charter only. |
| **Paths** | User-provided globs or directories; all charters focus there. |
| **Git delta** | User provides base (`main`, `origin/main`, tag) or “last N commits”; use `git diff`, `git log -n`, `git diff-tree --name-only`. |
| **Single feature** | User names flows (e.g. setup webview, machine profile, Hugging Face GGUF discovery, quantization compatibility, downloads, `llama-server` lifecycle, VS Code LM provider, Cursor OpenAI proxy); map to `README.md`, `README/Guides/`, `src/`, and `tests/`. |

State the **chosen scope** in the final report header.

## Mechanical signals (orchestrator, once)

From **repository root**, when the audited surface includes TypeScript/JavaScript:

1. **`npm run check`** — root TypeScript pass.
2. **`npm run lint`** when audited source files are in scope.
3. **`npm test`** when the audited surface touches executable logic or shared contracts.
4. **`npm run package`** when release packaging, extension manifest, or VSIX output is in scope.

Report failures as **P0 / Critical** findings with command output (summarize if
huge). Do not “fix” unless the user later asks.

Optional targeted checks can run individual Node test files or focused manual
Extension Development Host repros when a full suite is not the right proof.
Failures are **P0** unless clearly unrelated to the audited scope.

When subagents run, they should assume mechanical checks ran **once**; they
focus on **review**, not on re-running gates unless a charter requires
spot-checking a file.

## Subagent delegation (use judgment)

**When one agent is enough:** tiny or localized scope (e.g. a handful of files,
one worker, or a single focused diff); low coupling; user asked for a quick
pass. The orchestrator performs the full charter coverage **solo** (still hit
architecture, correctness, security/ops, and complexity—just in one pass).

**When to parallelize:** whole-repo or multi-package audit; large `git` range;
security- or money-sensitive paths; queue/cron/webhook/idempotency concerns; or
**any uncertainty** about depth. **When in doubt, use multiple chartered passes.**

### Harness compatibility

Not every runtime exposes Cursor’s **`Task`** tool. Same skill, two shapes:

| Harness | How to run multiple charters |
| --- | --- |
| **Cursor (has `Task`)** | In **one** turn, launch **up to four** `Task` subagents with `readonly: true`, **`subagent_type`:** `generalPurpose` (or `explore` for layout mapping). Use **`model: fast`** unless the user asks for maximum depth. |
| **No `Task` (e.g. Codex CLI, plain Claude Code, terminals)** | Run the **same charters sequentially**: one charter per pass, same scope each time, then **merge and dedupe**. Do **not** skip depth because you cannot parallelize—sequential is fine. |

You may use **fewer than four** charters if scope is medium (e.g. two passes:
correctness+security vs architecture+complexity).

**If parallelizing (Cursor `Task` only):** in **one assistant turn**, launch **up to four**
`Task` subagents with `readonly: true`, **`subagent_type`:** `generalPurpose`
(or `explore` when the request is mostly mapping file layout). Use **`model: fast`**
unless the user asks for maximum depth.

Give each subagent (or each sequential charter pass):

- The **exact scope** (paths, diff summary, or “whole repo”).
- One **charter** from below (copy the charter text into the task prompt).
- Instruction: **concrete file paths**, **severity** (P0–P3), **one paragraph
  max per finding**, **no generic advice**.

### Charter 1 — Architecture & modules

God modules; separation of concerns; public API surface; boundary clarity
(VS Code activation vs setup UI vs model discovery vs download vs `llama-server`
lifecycle vs OpenAI proxy vs provider integration); fan-in choke points;
misplaced orchestration vs domain logic. Flag files approaching
**~1000 LOC** or cramming unrelated responsibilities (**repo norm:** well
under 1k LOC per file).

### Charter 2 — Correctness & reliability

Logic bugs; error paths; swallowed exceptions; off-by-one; impossible states;
**async discipline** (missing `await`, fire-and-forget promises); idempotency and
at-least-once handlers (queues, webhooks, cron); boundary conditions; timeouts
and unbounded work in the extension host or local sidecar process.

### Charter 3 — Security, privacy, operational

Authn/authz gaps; injection or unsafe URL/HTML construction; secrets or PII in
logs; unsafe shell/process execution; path traversal in downloads or model
paths; operational foot-guns around local binaries, ports, cleanup, and
packaging **when relevant to scope**.

### Charter 4 — Complexity, duplication, maintainability

Needless abstraction; configuration or branching explosion; **duplication with
drift**; dead code; **comment/doc lies**; weak or lying tests; naming that hides
behavior; dependency weight for trivial wins.

## Consolidation (orchestrator)

After **subagents return** or after a **solo** review pass:

0. **Elon-musk pass:** re-read [`elon-musk`](../elon-musk/SKILL.md) if not already fresh this session; for **Architecture** and **Complexity debt**, explicitly ask: what should be *removed* (not just refactored), is this a *local maximum*, and does any heavy layer fail the **Idiot Index** test? Fold answers into deduped findings and grades.
1. **Dedupe:** merge findings that cite the same root cause or file+theme.
2. **Severity:** **P0** critical (wrongness, security, data loss, build breaks),
   **P1** high, **P2** medium, **P3** low / hygiene.
3. **Grades:** assign three letter grades **A–F** using [Grading rubric](#grading-rubric).
   **Overall grade = worst of the three** (if any dimension is **D**, overall
   cannot be **B** or higher—cap at **D** unless you justify an exception in one
   sentence).
4. **New teammate test:** one line—would a newcomer likely break this area in
   week one? (y/n + why)

## Grading rubric

Assign **Architecture**, **Correctness risk**, and **Complexity debt** separately.

| Grade | Meaning |
| --- | --- |
| **A** | Clear boundaries, hard to misuse, simple where it matters, issues are cosmetic. |
| **B** | Solid with minor debt; a few focused fixes would raise to A. |
| **C** | Meaningful issues; would block merges in a strict shop without a plan. |
| **D** | Serious structural or reliability risk; bounded scope but unsafe. |
| **F** | Unsafe, incomprehensible, or broken; needs pause and redesign or revert. |

**Correctness risk** includes likelihood of **latent bugs** and **failure-mode**
holes—not only existing failing tests.

## Output template

```text
## Audit scope
- ...

## Mechanical checks
- npm run check: pass | fail | not run (summary)
- npm run lint: pass | fail | not run (summary)
- npm test / targeted tests: pass | fail | not run (summary)
- npm run package when relevant: pass | fail | not run (summary)
- tests (if run): ...

## Grades
- Architecture: ?
- Correctness risk: ?
- Complexity debt: ?
- Overall (worst-of-three): ?

## Findings (severity order)
### P0 — Critical
- ...

### P1 — High
- ...

### P2 — Medium
- ...

### P3 — Low
- ...

## Delegation / overlap notes
- Solo vs multi-charter (parallel `Task` or sequential); deduped: ...

## Residual risks / what we did not run
- ...

## New teammate test
- ...
```

## Anti-patterns

- **Whole-repo or high-risk audit in a single shallow pass** when depth was
  needed—**when in doubt, parallelize.**
- **Four subagents for a three-line diff**—wasted latency; judge proportionally.
- **Findings without paths**—every substantive issue should anchor to a file or
  symbol when possible.
- **Auto-implementing** during audit when the user only asked for review.
- **Grade inflation**—if Correctness is **D**, overall is not **B**.
- **Ignoring mechanical failures**—typecheck/lint red is at least **P0** for
  code health.

## Relation to other skills

- **`elon-musk`:** **Invoked by this skill** (read the skill file; apply before
  final **Architecture** / **Complexity debt** grades). Not a separate user
  trigger—**audit** always loads it for that slice of judgment. For dependency
  scans after the call, use **`build-vs-buy`**; **`elon-musk`** already points
  there in its handoff rules.
- **`phase-audit`:** phase-scoped audit–fix loop to **A / A / A** plus plan checklist
  and phase rubric; commits when standalone; defers commit to **`execute-plan`**
  step **4d** when embedded.
- **`git-commit`:** post-commit **non-blocking** **`npm run check`** + **`HEAD`**
  diff scan only—**not** a substitute for **`audit`** (no lint-by-default, no
  grades, no multi-agent).
- **`deploy`:** **blocking** gates before ship; audit does not replace deploy
  checks when the goal is to deploy.
