---
name: build-vs-buy
description: Decide whether to adopt an open-source library or build in-house before committing to a design. Use when scoping a feature, writing a plan, evaluating architecture, or when the user suggests implementing infrastructure, parsing, UI primitives, SDK wrappers, or other reusable capabilities from scratch. Runs a short OSS scan (WebSearch), shortlists candidates, and records a dependency cost note. Prefer TypeScript-friendly libraries that work cleanly inside a VS Code extension and reduce complexity in this repo.
---

# Build vs Buy

## Purpose

Use this skill as a quick "does this already exist?" pass before inventing a
custom implementation.

Default bias:

- Prefer a well-supported library when it clearly fits.
- Prefer building in-house when library fit is weak, heavy, abandoned, unsafe,
  or would add more complexity than it removes.
- In this repo, prefer libraries that are friendly to VS Code extensions,
  macOS local runtime constraints, ESM, and TypeScript.

## Use When

- Scoping a new feature or subsystem.
- Writing a checked-in plan.
- Proposing an architecture for a reusable capability.
- The work smells like something the open-source ecosystem probably already
  solved.
- The user asks whether a package, SDK, component library, parser, queue,
  adapter, or utility already exists.

## Do Not Use When

- The task is obviously app-specific product logic.
- The repo already has an established library for the job.
- The user explicitly wants a scratch implementation regardless of ecosystem
  options.
- A five-minute search would cost more than the code itself.

## Procedure

1. Define the capability in one sentence.
2. List the non-negotiables:
   - runtime or platform constraints
   - license constraints
   - maintenance expectations
   - bundle size or dependency sensitivity
   - required features
3. Run a short **WebSearch** pass for established open-source options.
4. Shortlist at most **3** candidates.
5. Reject weak fits quickly.
6. Recommend either:
   - **Use library**
   - **Build thin wrapper around library**
   - **Build from scratch**
7. Include a one-paragraph **dependency cost note** with the decision.

Keep this pass lightweight. Usually **5 to 15 minutes**, not a research rabbit
hole.

## Search Workflow

Use targeted searches like:

- `best open source <capability> <language>`
- `github <capability> library typescript`
- `<capability> npm mature maintained`
- `<capability> vscode extension`
- `<capability> node typescript`
- `<capability> comparison open source`

Favor signals like:

- active maintenance
- clear documentation
- real adoption
- compatibility with the repo runtime
- small, understandable API surface

For Local Motion, add these filters early:

- works in a VS Code extension host or Node sidecar context when relevant
- ships ESM or clean modern bundler support
- has solid TypeScript support
- avoids native install steps unless the target surface is explicitly local
  macOS tooling
- can be hidden behind a local adapter if we ever replace it

## Evaluation Rubric

Check each candidate for:

- **Fit**: solves the actual problem, not a nearby one
- **Weight**: dependency size, API sprawl, operational overhead
- **Maintenance**: recent activity, issue health, release cadence
- **Adoption**: real usage, stars are a weak signal but still useful
- **Compatibility**: TypeScript, ESM, VS Code extension host, Node/macOS limits
- **License**: acceptable for the project
- **Escape hatch**: can we replace it later without surgery?
- **Dependency cost**: package count, transitive risk, cognitive overhead, and
  lock-in

Reject candidates fast if they are:

- abandoned
- overbuilt for the need
- browser-only when the runtime is the VS Code extension host or Node sidecar
- difficult to integrate safely
- poorly documented
- coupled to a larger framework we do not want
- dependent on native install steps that add more user pain than they remove

## Repo Bias

When two options are otherwise close, prefer the one that is:

- smaller
- framework-agnostic
- extension-host safe
- TypeScript-first
- easy to wrap behind a thin local interface

Do not add a dependency just because it exists. The library must beat a simple
local implementation on total maintenance cost.

## Recommendation Format

Return a short decision note:

```md
Capability: <one sentence>

Candidates:
- <library 1> - why it is promising or why it was rejected
- <library 2> - why it is promising or why it was rejected
- <library 3> - why it is promising or why it was rejected

Decision:
- Use library / Wrap library / Build from scratch

Why:
- <2-4 concrete reasons>

Dependency cost note:
- <bundle/runtime impact, transitive deps, operational cost, lock-in risk>

Next step:
- <what to plan or implement next>
```

## Decision Rules

- If one candidate clearly fits and lowers complexity, use it.
- If a candidate is close but exposes too much surface area, wrap it behind a
  local adapter.
- If every candidate adds more risk or complexity than value, build the
  smallest custom solution that can work.
- When uncertain, prefer the option that is simpler to maintain by ordinary
  teammates six months from now.

## After Shortlisting

If a library is the likely winner and the task depends on current API details,
fetch current docs with Context7 before writing implementation steps or code.

## Handoff

- During planning: include the shortlist and decision in the plan so future
  implementers know the build-vs-buy check already happened. Include the
  dependency cost note even if the decision is "build from scratch" or "no new
  dependency."
- During implementation: either adopt the chosen library or note explicitly why
  the repo is intentionally building a custom solution.
