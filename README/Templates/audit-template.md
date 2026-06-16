# [Audit Name]

- **Date:** YYYY-MM-DD
- **Auditor:** [Name or Team]
- **Status:** Draft | In Progress | Final | Superseded
- **Scope:** [System, feature, workflow]
- **Standard/Baseline:** [WCAG 2.2 AA | SLO | Security policy | Other]
- **Confidence:** High | Medium | Low

> Purpose: [One sentence on why this audit exists and what decision it enables.]

## Executive Summary

- **Overall verdict:** Pass | Mostly Pass | Fail
- **Total findings:** [#]
- **Blocking findings (P0/P1):** [#]
- **Top risk:** [One sentence]
- **Recommended next move:** [One sentence]

## Scope and Exclusions

### In Scope

- [Feature area, file set, user flow, runtime]

### Out of Scope

- [Explicit exclusion and why]

## Methodology

- **Evidence sources:** [Code review, logs, metrics, manual QA, tests]
- **Snapshot timestamp:** YYYY-MM-DD HH:MM TZ
- **Environment:** [Browser/OS/stage/build hash]
- **Approach:** [How evidence was gathered and verified]

### Commands Used

```bash
# Include commands that produced evidence
rg "pattern" packages/
npm test -- path/to/test
```

## Severity Rubric

| Severity | Meaning | Ship Gate |
| --- | --- | --- |
| P0 Critical | Security breach, data loss, or total outage | Block |
| P1 High | Major user break or correctness risk | Block unless accepted |
| P2 Medium | Quality/reliability issue with workaround | Ship with owner/date |
| P3 Low | Cosmetic issue or minor debt | Backlog |

## Findings Overview

| ID | Sev | Effort | Status | Owner | Target | Summary |
| --- | --- | --- | --- | --- | --- | --- |
| A-001 | P1 | Small | Open | [Owner] | YYYY-MM-DD | [Summary] |

## Detailed Findings

### A-001 [Short Finding Title]

- **Severity:** P1
- **Effort:** Trivial | Small | Medium | Large
- **Status:** Open | Fixed | Accepted Risk | Needs Re-test
- **Confidence:** High | Medium | Low
- **Owner:** [Person or team]
- **Target date:** YYYY-MM-DD

#### Why This Matters

[User impact, business impact, and technical risk in 1-3 sentences.]

#### Evidence

- `path/to/file.ts:123` - [What this proves]

```log
[Relevant log output, error text, or metric sample]
```

#### Reproduction

1. [Step]
2. [Step]
3. [Expected vs actual]

#### Root Cause

[1-3 sentences. If unverified: "TBD. Not manually confirmed."]

#### Recommended Fix (Simplest Path First)

- [Primary fix]
- [Fallback or guardrail]

#### Verification

- [ ] Automated: `npm test -- path/to/test`
- [ ] Manual: [Manual validation step]
- [ ] Regression: [Neighboring flow check]

Repeat this block for additional findings.

## What's Working Well

- **[Pattern name]:** `path/to/file.ts` - [Why this should be preserved]

## Accepted Risks / No Action

- [Defer with reason, owner, and revisit date]

## Priority Action Plan

### Immediate (P0/P1)

1. [Action, owner, due date]

### Next (P2)

1. [Action, owner, due date]

### Later (P3 / Debt)

1. [Action, owner, due date]

## Remediation Tracker

| ID | Status | Owner | PR/Commit | Verified Date |
| --- | --- | --- | --- | --- |
| A-001 | Open | [Owner] | [Link] | YYYY-MM-DD |

## Validation Checklist

### Automated

- [ ] [Test suite or lint check]

### Manual

- [ ] [Manual user flow check]

## References

### Internal

- [Related Guide](../Guides/path/to/guide.md)
- [Related Plan](../Plans/path/to/plan.md)
- [Related Notes](../Notes/path/to/notes.md)

### External

- [External Standard or Spec](https://example.com/spec)

## Audit Log

### YYYY-MM-DD

- [What changed in this audit and why]

---

## Modules (Optional)

Delete unused modules. Keep only what improves this audit.

### Decisions Locked

- **[Decision]:** [What was decided and why. Do not revisit.]

### Inventory Table

| Item | Current Value | Expected Value | Status | Location | Notes |
| --- | --- | --- | --- | --- | --- |
| [Item] | [Current] | [Expected] | P/F | `f:l` | [Ctx] |

### Current-to-Target Mapping

| Item | Current | Target | Notes | Location |
| --- | --- | --- | --- | --- |
| [Selector/item] | [Current] | [Target] | [Reasoning] | `file:line` |

### Comparison Matrix

| Feature | Chrome | Firefox | Safari | Edge | Notes |
| --- | --- | --- | --- | --- | --- |
| [Feature] | Pass | Pass | Fail | Pass | [Details] |

---

<!--
USAGE NOTES:

1. Evidence first: every finding needs reproducible proof.
2. Anchor file references to snapshot date and commit when possible.
3. Accepted risks require owner and revisit date.
4. Keep fixes simple and high-leverage.
5. Mark status as Superseded if stale and not re-verified.
-->
