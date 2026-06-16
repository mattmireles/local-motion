# Experiment Documentation Template

Use this for new work in `README/Experiments/{experiment-name}/`.

Use the experiment slug in filenames too:

- `{experiment-name}-plan.md`
- `{experiment-name}-results-YYYY-MM-DD.md`

Related standards:

- Registry: [README/Experiments/README.md](../Experiments/README.md)
- Metadata schema: [README/Experiments/experiment.schema.json](../Experiments/experiment.schema.json)
- Validator script: [scripts/validate-experiments.js](../../scripts/validate-experiments.js)

The goal is simple:

- one clear question
- one frozen scope
- one canonical answer

If an experiment produces raw artifacts but no human conclusion, it is incomplete.
If an experiment produces multiple "main" docs with no clear authority, it is also incomplete.

## Directory Contract

Minimum directory shape for a completed experiment:

```text
README/Experiments/{experiment-name}/
├── experiment.json
├── {experiment-name}-plan.md
├── analysis/
│   └── {experiment-name}-results-YYYY-MM-DD.md
└── data/
```

When the experiment gets more complex, extend it like this:

```text
README/Experiments/{experiment-name}/
├── README.md
├── experiment.json
├── {experiment-name}-plan.md
├── analysis/
│   ├── {experiment-name}-results-YYYY-MM-DD.md
│   ├── addendum-YYYY-MM-DD.md
│   ├── execution-log-YYYY-MM-DD.md
│   └── README-judging.md
└── data/
```

Rules:

- `{experiment-name}-plan.md` is the setup and execution contract. Do not turn it into the final verdict.
- `analysis/{experiment-name}-results-YYYY-MM-DD.md` is the canonical conclusion for one finished run or one final synthesis.
- `experiment.json` is the machine-readable source of truth for registries, validation, and supersession tracking.
- `docs.canonicalResults` may stay `null` while the experiment is still `Planned` or `In-Progress`, or when the folder is a retired `Cancelled` or `Superseded` placeholder.
- A canonical results doc becomes required when the experiment status moves to `Completed`.
- Addenda, reruns, and logs live under `analysis/` and must say whether they change the canonical conclusion.
- Add `README.md` at the experiment root if the directory has more than one plausible "main" analysis doc.
- Use repo-relative Markdown links in checked-in docs. Do not hardcode local machine paths like `/Users/...`.

## Status Vocabulary

Use these values exactly:

- `Planned`
- `In-Progress`
- `Completed`
- `Superseded`
- `Cancelled`

Do not leave a doc marked `In-Progress` after the run is complete.

## `experiment.json` Template

```json
{
  "experimentName": "{experiment-name}",
  "title": "[Human-readable title]",
  "status": "Planned",
  "question": "[One sentence]",
  "owner": "[Name]",
  "startedOn": "YYYY-MM-DD",
  "lastUpdated": "YYYY-MM-DD",
  "baselineSha": null,
  "environment": "staging",
  "artifactRoot": "README/Experiments/{experiment-name}/data",
  "tags": [
    "bakeoff"
  ],
  "runIds": [],
  "docs": {
    "index": null,
    "plan": "README/Experiments/{experiment-name}/{experiment-name}-plan.md",
    "canonicalResults": null,
    "judging": null,
    "executionLog": null
  },
  "canonicalVerdict": {
    "state": "pending",
    "winner": null,
    "summary": "Experiment not complete yet.",
    "confidence": "N/A"
  },
  "supersedes": [],
  "supersededBy": [],
  "notes": ""
}
```

Validation workflow:

- `npm run audit:experiments` for a transition-friendly audit
- `npm run validate:experiments` for strict validation

## `{experiment-name}-plan.md` Template

```markdown
# [Experiment Name] Plan

- **Date:** YYYY-MM-DD
- **Status:** Planned | In-Progress | Completed | Superseded | Cancelled
- **Experiment:** `[experiment-name]`
- **Question:** [One sentence]
- **Owner:** [Name]
- **Baseline SHA:** `[git sha]` or `TBD before first run`
- **Environment:** [staging | production clone | local direct runner]
- **Artifact Root:** `README/Experiments/[experiment-name]/data/`
- **Canonical Results:** [Canonical results](./analysis/[experiment-name]-results-YYYY-MM-DD.md) or `TBD`
- **Supersedes:** [older doc] or `None`
- **Superseded By:** [newer doc] or `None`

## Executive Summary

One short paragraph that answers:

- What are we testing?
- Why now?
- What decision should this enable?

## Problem Statement

- **Symptom:** [What is unclear or broken?]
- **Root Cause:** [Why this question exists]
- **Impact:** [Why we should care]

## Hypothesis

[If we change X while holding Y fixed, we expect Z.]

## Scope and Non-Goals

### In Scope

- [Included surface]
- [Included surface]

### Non-Goals

- [Deliberate exclusion]
- [Deliberate exclusion]

## What Changes

- [What is allowed to vary]

## What Stays Fixed

- [What must not drift]

## Corpus Lock

| Content ID | Title | Type | Notes |
| --- | --- | --- | --- |
| `...` | ... | ... | ... |

## Variant Matrix

| Variant | Models / Prompt / Regime | Why it is in scope |
| --- | --- | --- |
| `a` | ... | ... |
| `b` | ... | ... |

**Planned cells:** `N`

## Methodology and Rubric

- **Primary metric:** [What decides the winner]
- **Secondary metrics:** [Operational or cost metrics]
- **Scoring rubric:** [Human or automated rubric]
- **Winner logic:** [How ties are broken]
- **What counts as invalid:** [fallback-only, route mismatch, timeout, bad scrape, missing artifact, etc.]

## Ground Truth Contracts

- **[Contract name]:** [Rule that must not be violated]
- **[Contract name]:** [Rule that must not be violated]

## Artifact Layout

```text
README/Experiments/[experiment-name]/
├── experiment.json
├── [experiment-name]-plan.md
├── analysis/
│   └── [experiment-name]-results-YYYY-MM-DD.md
└── data/
    ├── index.json
    └── ...
```

Minimum exported artifacts:

- `index.json`
- `execution-meta.json`
- `final-gist.md`
- [Any experiment-specific required artifacts]

## Run Commands

```bash
# Prepare
[command]

# Run
[command]

# Rerun
[command]

# Export
[command]
```

## Execution Notes

- [Operator caveat]
- [Rate-limit or transport caveat]
- [Rerun policy]

## Addenda and Supersession Rules

- Addenda live in `analysis/`.
- Every addendum must include a line like `Conclusion impact: Does not change the canonical conclusion.`
- Every addendum may instead include a line like `Conclusion impact: Supersedes [results doc].`
- Update `Canonical Results` when the canonical answer changes.

## Success Criteria

- [ ] [What must be true for this experiment to count as done]
- [ ] [What must be true for this experiment to count as done]

## References

- [Related experiment](../other-experiment/other-experiment-plan.md)
- [Relevant runner](../../../packages/backend/scripts/example.ts)
- [Relevant notes](../../Notes/example.md)
- [Registry](../Experiments/README.md)
- [Metadata schema](../Experiments/experiment.schema.json)
```

## `analysis/{experiment-name}-results-YYYY-MM-DD.md` Template

```markdown
# [Experiment Name] Results

- **Date:** YYYY-MM-DD
- **Last Updated:** YYYY-MM-DD
- **Status:** Completed | Superseded
- **Experiment:** `[experiment-name]`
- **Question:** [Same question as the plan]
- **Authoritative Verdict:** Yes
- **Run IDs:** `[run-id-1]`, `[run-id-2]`
- **Baseline SHA:** `[git sha]`
- **Plan:** [Experiment plan](../[experiment-name]-plan.md)
- **Supersedes:** [older results doc] or `None`
- **Superseded By:** [newer results doc] or `None`

## Canonical Answer

One short paragraph that answers:

- What won?
- What lost?
- What is the product or engineering implication?

## Decision

- **Recommendation:** Ship | Do not ship | Needs follow-up
- **Winner:** [Variant or outcome]
- **Confidence:** High | Medium | Low
- **Why:** [Short reason]

## Scope of This Verdict

- **Included:** [What this doc covers]
- **Excluded:** [What this doc does not cover]
- **Scorable-clean cells:** `x / y`
- **Invalid or excluded cells:** `n`
- **Does this change prior canon?** Yes | No

## Results Summary

| Variant | Mean score | Clean cells | Notes |
| --- | --- | --- | --- |
| `a` | ... | ... | ... |
| `b` | ... | ... | ... |

## Key Findings

### 1. [Finding]

[Evidence-backed explanation]

### 2. [Finding]

[Evidence-backed explanation]

## Exceptions and Confounders

- **Route mismatches:** [What happened]
- **Fallback contamination:** [What happened]
- **Timeouts / provider failures / gate waits:** [What happened]
- **Bad inputs / scrape issues:** [What happened]

## Operational Readout

- [Ship rate]
- [Retry count]
- [Fallback count]
- [Latency or cost note]

## Artifact Index

- [Run index](../data/index.json)
- [Prepared artifacts](../data/_prepared/)
- [Execution log](./execution-log-YYYY-MM-DD.md)

## Addenda and Reruns

- [Addendum title](./addendum-YYYY-MM-DD.md) - [Does or does not change canonical conclusion]

## Follow-Ups

- [Next experiment]
- [Bug to fix]
- [Thing to standardize]
```

## Required Completion Checklist

Before calling an experiment complete:

- `{experiment-name}-plan.md` status is accurate
- `experiment.json` exists and matches the current doc state
- canonical results doc exists
- winner logic is stated explicitly
- invalid cells and confounders are called out explicitly
- artifact root is linked
- counts, paths, and run IDs were scrubbed once after the run
- any addendum says whether it changes the canonical answer
- `npm run audit:experiments` is clean for the new folder

## Do Not Repeat

Avoid these failure modes:

- empty placeholder result files
- raw data with no human summary
- a plan that quietly becomes a postmortem
- multiple plausible "main" result docs with no authority marker
- stale unchecked tasks after the experiment is finished
- stale `In-Progress` status after results land
- machine-specific filesystem links in checked-in docs
- round-by-round judging docs with no synthesis doc above them

## Recommended Style

Prefer the strongest patterns already in this repo:

- rigorous scope lock from `v1-instant-bakeoff` and `v7-combined-bakeoff`
- clear executive answer from `v7-instant-gist-ablation`
- invalid-cell and ops-noise separation from `v9-specialized-qa-bakeoff`
- canonical summary doc behavior from `v9-outline-first-handoff`

If an experiment gets complicated, add more analysis docs. Do not weaken the canonical results doc.
