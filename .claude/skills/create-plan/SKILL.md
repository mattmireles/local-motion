---
name: create-plan
description: Create an implementation plan for this repo. Use when the user wants a checked-in plan under README/Plans, wants the work scoped into phases, and expects the plan to be built from repo guides and notes first, with Context7 only when current external library or framework behavior materially affects the plan. Do not use for implementing the work, informal brainstorming, or lightweight notes.
---

# Create Plan

## Purpose

Use this skill to turn a concrete request into a repo-native implementation
plan. The output is a real **canonical** plan file at
`README/Plans/{id}-{kebab-slug}.md`, not a chat-only outline.

## Use When

- The work is large enough to need a real implementation plan.
- The user wants a plan written into the repo.
- The implementation needs phases, verification steps, and concrete files.

## Do Not Use When

- The user wants direct implementation instead of planning.
- The request is still too vague to scope honestly.
- The output should be a note, scratchpad, or brainstorm instead of a plan.

## Procedure

1. Read [references/index.md](references/index.md) first.
2. Gather repo context in this order:
   - directly related `README/Guides`
   - directly related `README/Notes`
   - neighboring plans under `README/Plans/`
3. Use Context7 only when the plan depends on current library, framework, or
   API behavior that may have changed.
4. If Context7 is insufficient, fall back to official vendor docs.
5. **Number the plan file:** assign the next monotonic id and use the filename
   pattern `{id}-{kebab-slug}.md` (for example `216-tenant-routing-plan.md`). See
   [references/index.md](references/index.md) for how to pick `id` without
   colliding with existing plans.
6. Write the first draft to **`README/Plans/{id}-{kebab-slug}.md`**. Link other
   plans with stable paths (`README/Plans/001-foo-plan.md`). Make the plan
   implementation ready:
   - concrete phases
   - specific files where knowable
   - verification per phase
   - hard requirements
   - rollback or kill switch when relevant
7. Run a fresh cross-agent CLI review pass on the saved draft when the Codex
   or Claude Code CLIs are available:
   - use `scripts/run-cross-agent-plan-review.sh <plan-path>` only if that helper exists
   - otherwise launch Cursor subagents or run a local audit-style review using
     the same plan rubric
   - read both review artifacts (whichever ran)
   - integrate concrete findings into the plan
   - prefer repo ground truth over reviewer speculation
   - move unresolved disagreements into `Open Questions`
8. If the external reviewer is unavailable or fails, run the same audit locally
   and note the missing reviewer path in your handoff.
9. Audit the final plan before stopping:
   - no missing policy that an implementer would have to invent
   - no fake certainty where the repo context is incomplete
   - no implementation work performed while planning
   - no unresolved reviewer finding silently ignored without explanation

## Canonical Docs

Read [references/index.md](references/index.md) first. It maps the canonical
workflow guide, the plan template, and the repo references to inspect before
writing a new plan.

## Handoff Rules

- Hand off to `execute-plan` only after the plan is checked in and the user
  wants implementation.
- Hand off to a domain skill only if the planning request narrows into a
  domain-specific technical question that must be answered before the plan can
  be completed.
