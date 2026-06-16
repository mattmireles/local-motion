---
name: research-planning
description: Use Gemini Deep Research via the Interactions API to create or refresh external field guides in README/Guides before planning or implementation. Use when the user wants exhaustive web research on a technology, API, framework, platform, or domain with practical code examples, gotchas, limitations, and debugging guidance. Do not use for repo-only architecture work, local bug reproduction, or direct implementation without external research.
---

# Research Planning

## Purpose

Use this skill when Gist needs hard external research before planning or
implementation. The durable artifact is usually a `README/Guides/...` field
guide grounded in current web research, not a chat-only summary.

## Use When

- The user wants a new or refreshed `README/Guides/...` document.
- The work depends on current vendor, SDK, API, browser, or platform behavior.
- The guide must answer what the thing is, how it works, what breaks, and how
  to choose an implementation path.
- The output needs practical examples with code, not a theory essay.

## Do Not Use When

- The task is already a concrete repo implementation with enough local context.
- The task is a purely local bug with a live repro inside the repo.
- The request is internal architecture, policy, or process rather than external
  research.
- The output should be a temporary scratch artifact instead of durable research.

## Procedure

1. Read [references/index.md](references/index.md) first.
2. Lock the scope before calling Gemini:
   - exact topic
   - exact version, model, SDK, or platform when known
   - target path under `README/Guides/...`
   - the decision, plan, or implementation this guide must unblock
3. Prefer updating an existing guide over creating a sibling duplicate.
4. Write the prompt into `tmp/deep-research/<slug>-planning-prompt.md`.
5. Run the helper:

```bash
node scripts/gemini-deep-research.js \
  --prompt-file tmp/deep-research/<slug>-planning-prompt.md \
  --out README/Guides/<path>/<slug>-guide.md \
  --id-out tmp/deep-research/<slug>.id
```

6. Review the generated guide before treating it as real:
   - strip filler and marketing prose
   - normalize headings to the repo guide template
   - verify dates, preview labels, model names, version numbers, and links
   - keep repo-specific guidance clearly separated from external facts
7. If the guide exists to unblock implementation scoping, hand off to
   `create-plan` after the guide is clean.

## Prompt Contract

The default prompt shape is:

```md
Create an advanced hacker's field guide for [TOPIC].

Audience: senior engineers working in the Gist repo.
Goal: produce a durable external research guide that will live at [TARGET_PATH]
and unblock [DECISION OR PLAN].

Questions to answer:
- What is it?
- How does it work in practice?
- Best practices?
- Common issues?
- Known bugs?
- Gotchas?
- Limitations?
- Non-obvious or unintuitive patterns?
- What should we never do?
- How do we debug it when it breaks?
- How should we choose between the main implementation options?

Constraints:
- Be exhaustive.
- Go light on theory, heavy on practical examples with code.
- Prefer official docs and primary sources first.
- Use secondary sources only for missing beta behavior, known bugs, or
  community-confirmed workarounds.
- Distinguish confirmed facts from inference.
- Use exact versions, model IDs, preview labels, and dates where behavior may
  drift.
- Return Markdown only.
- Use this section order:
  1. Related Documentation
  2. The Environment: Constraints and Mental Model
  3. Architecture and Core Concepts
  4. Implementation Patterns
  5. Gotchas, Edge Cases, and Failure Modes
  6. What NOT to Do (Anti-Patterns)
  7. Decision Framework
  8. Debugging Playbook
  9. Production Hardening (only if relevant)
  10. Works Cited
- Include code examples with comments that explain why, not just what.
- Every non-obvious claim must be traceable in Works Cited.
- Do not invent repo internals. Leave repo cross-links for local integration.
```

## Output Rules

- The durable artifact lives in `README/Guides/...` because this is external
  research.
- Use the most specific existing subtree instead of inventing a noisy new one.
- If an existing guide already covers most of the topic, update it instead of
  creating a near-duplicate file.
- Add repo cross-links after generation. Gemini will not know the repo tree on
  its own.

## Quality Bar

Reject or heavily edit output that:

- reads like marketing copy
- hides the failure modes below generic explanation
- lacks code or concrete operational steps
- uses vague timing like "recently" instead of exact dates
- treats preview or beta behavior as stable
- mixes speculation with confirmed behavior

## Handoff Rules

- Hand off to `research-debugging` when the work narrows from broad planning
  research into a concrete external failure or vendor bug hunt.
- Hand off to `create-plan` when the guide is good enough to scope real repo
  implementation.
- Hand off to a domain skill only after the external guide has done its job and
  the remaining work becomes repo-specific.
