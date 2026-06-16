---
name: research-debugging
description: Use Gemini Deep Research via the Interactions API to investigate external bugs, vendor limits, SDK mismatches, issue trackers, and workaround patterns, then turn the result into a durable debug guide in README/Guides. Use when a failure depends on web research outside the repo. Do not use for purely local bugs, generic implementation work, or broad planning research that is not tied to a concrete failure.
---

# Research Debugging

## Purpose

Use this skill when local logs and repo code are not enough because the failure
depends on external behavior: vendor bugs, preview-model limits, SDK issues,
forum reports, changelog drift, or cross-platform gotchas. The output is a
durable debugging guide or guide update, not an ephemeral chat answer.

## Use When

- The task has a concrete symptom, error, regression, or confusing behavior.
- The fix depends on vendor docs, bug trackers, forum threads, or community
  workarounds outside the repo.
- The issue involves exact versions, dates, model IDs, SDK mismatches, quotas,
  timeouts, or preview features.
- The research should be saved back into `README/Guides/...` for future reuse.

## Do Not Use When

- The bug is purely local and reproducible from repo state alone.
- The task is broad technology research rather than a concrete failure.
- The request is direct implementation with no need for external investigation.
- The problem is already well covered by an existing repo guide and only needs
  normal debugging work.

## Procedure

1. Read [references/index.md](references/index.md) first.
2. Capture the failing contract exactly:
   - symptom
   - exact error text
   - environment and versions
   - date of the failure
   - minimal repro
   - what has already been ruled out
3. Decide whether to update an existing guide or create a focused debug guide
   in the most specific `README/Guides/...` subtree.
4. Write the prompt into `tmp/deep-research/<slug>-debugging-prompt.md`.
5. Run the helper if this repo has one; otherwise use available MCP/web
   research tools and save the guide yourself:

```bash
node scripts/gemini-deep-research.js \
  --prompt-file tmp/deep-research/<slug>-debugging-prompt.md \
  --out README/Guides/<path>/<slug>-guide.md \
  --id-out tmp/deep-research/<slug>.id
```

6. Review the output with a skeptic's eye:
   - preserve the exact symptom and error strings
   - separate confirmed behavior from inference
   - avoid elevating a single forum anecdote into ground truth
   - keep version numbers, preview labels, and dates explicit
   - make the diagnosis order runnable by another engineer
7. After the guide is solid, switch back to the concrete repo fix or hand off
   to the right domain skill.

## Prompt Contract

The default prompt shape is:

```md
Create an advanced hacker's debugging field guide for [SYSTEM OR FAILURE].

Audience: senior engineers working in the Local Motion repo.
Goal: produce a durable external debugging guide that will live at [TARGET_PATH]
and help us fix [CONCRETE FAILURE].

Context:
- Symptom: [what we observe]
- Exact errors: [copy exact text]
- Environment: [platform, SDK, model, browser, API version]
- Date: [when this happened]
- Minimal repro: [short repro]
- Already ruled out: [facts]

Research tasks:
- Identify documented failure modes that match the symptom.
- Find official docs, changelogs, forum posts, and GitHub issues that explain
  the behavior or expose adjacent edge cases.
- Separate confirmed limits from plausible hypotheses.
- Build a fix matrix: symptom -> likely cause -> how to confirm -> how to fix.
- Surface non-obvious interactions, preview limitations, and anti-patterns.
- Include code or config examples where they materially help.

Constraints:
- Prefer official docs and primary sources first.
- Use community threads only when they add missing bug context or workarounds.
- Mark inference explicitly.
- Use exact dates, versions, model IDs, and preview labels.
- Return Markdown only.
- Use this section order:
  1. Problem Frame
  2. Failure Surface Map
  3. Known Bugs and Confirmed Vendor Limits
  4. Diagnostic Sequence
  5. Workarounds and Fix Patterns
  6. Anti-Patterns
  7. Escalation Triggers
  8. Works Cited
- Every non-obvious claim must have a source.
- Do not invent repo internals or local logs we did not provide.
```

## Output Rules

- Default to `README/Guides/...` because this is durable external research.
- Prefer updating an existing guide with a new failure-mode section over
  creating a duplicate sibling guide.
- Keep the guide narrow around the actual failure surface. Do not turn every
  bug hunt into a general platform encyclopedia.

## Quality Bar

Reject or heavily edit output that:

- loses the exact symptom in a sea of generic explanation
- fails to distinguish confirmed behavior from inference
- cites only community discussion when primary sources are available
- omits diagnosis order, confirmation steps, or workarounds
- hides unstable behavior behind vague language instead of dates and versions

## Handoff Rules

- Hand off to `research-planning` when the task is no longer a concrete bug and
  has widened into broad pre-implementation research.
- Hand off to the relevant domain skill after the external failure surface is
  clear and the remaining work is repo-local.
- Hand off to `create-plan` only when the debugging findings imply a larger
  scoped refactor that needs a checked-in implementation plan.
