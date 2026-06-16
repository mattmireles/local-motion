# Wiki Page Template

Copy this structure when creating or updating `README/Wiki/**/*.md` pages.
Use the `markdown` skill for lint-sensitive formatting.

```markdown
---
title: [Topic name]
topic: [extension | backend | reader | scraping | bedrock | gemini | auto-gist | hot-paths | infrastructure | content | integrations | ...]
status: living | stable | deprecated
last_synced: YYYY-MM-DD
sources:
  - README/Guides/<path>.md
  - README/Notes/<path>.md
  - README/Hot-Paths/<path>.md
references:
  - README/Experiments/<dir>/
related:
  - README/Wiki/<other-topic>/<page>.md
---

# [Topic name]

> Synthesis of the files listed in `sources:`. If this page disagrees with a
> source, the source is canonical until reconciled via ingest or capture.

Optional **`claims:`** (add inside the frontmatter block above): a YAML mapping
of machine-checkable scalars only (string, number, boolean, or null). The same
key must have the same value on every page that sets it — enforced by
`npm run wiki-claims-check`. Namespaced keys (`wiki.reader.foo`) reduce
collisions. Omit `claims:` entirely if you have nothing to check.

## Current Belief

[One paragraph: what we currently believe is true, as of last_synced.]

## Key Decisions

- [Decision — date — link to source]

## Known Gotchas

- [Failure modes, edge cases, drift risks]

## Open Questions

- [Unknowns]

## Reference Material

- Canonical reference: `README/Guides/...` (when applicable)

## Change Log

- YYYY-MM-DD — [what changed, which source triggered it]
```

## Exclusions (never in `sources:`)

- `README/Plans/**`
- `README/Audits/**`
- Raw bodies from `README/Experiments/**` (directory paths only in `references:`)

## Note filename exclusions (Phase 4)

Do not ingest notes matching: `audit-*.md`, `qa-*.md` (point-in-time artifacts).
