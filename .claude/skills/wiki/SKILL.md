---
name: wiki
description: Operate Gist's README/Wiki workflow: ingest Guides/Notes/Hot-Paths into wiki pages, lint wiki policy and claims, capture durable Q&A with provenance, or run the optional Gemini contradictions report. Use for wiki architecture, README/Wiki drift, last_synced, sources provenance, wiki lint failures, and durable knowledge promotion. Do not use for ordinary markdown cleanup (use markdown), raw notes (use write-notes), or one-off guide ingestion (use guide-ingest).
---

# Wiki

## Purpose

Operate the Gist repo wiki as a small, reviewable markdown knowledge system.
Keep durable belief in `README/Wiki/`, preserve provenance to canonical source
files, and use deterministic checks before semantic reports.

## Use When

- New or updated `README/Guides/`, `README/Notes/`, or `README/Hot-Paths/`
  sources should be reflected in `README/Wiki/`.
- A wiki page needs `sources:`, `last_synced`, `claims:`, or `## Change Log`
  maintenance.
- A session produced a high-value answer that the user wants promoted into
  durable wiki belief.
- The user asks for wiki lint, wiki claims checks, or a contradiction/tension
  report.

## Do Not Use When

- The task is only markdown formatting; use `markdown`.
- The task is writing raw investigation notes; use `write-notes`.
- The task is importing external research into a guide; use `guide-ingest`.
- Sources live under `README/Plans/` or `README/Audits/`; wiki sources must not
  cite those.

## Modes

### Ingest

Use when canonical source docs need to update a wiki page.

1. Read [references/index.md](references/index.md).
2. Read `README/Guides/integrations/wiki-workflow-guide.md`.
3. Verify every source path is allowed:
   - allowed: `README/Guides/`, `README/Notes/`, `README/Hot-Paths/`
   - forbidden: `README/Plans/`, `README/Audits/`, excluded notes such as
     `audit-*.md` and `qa-*.md`
4. Map sources to `README/Wiki/<topic>/...` using `README/Wiki/README.md`.
5. Edit or create wiki pages from `README/Templates/Wiki-template.md`.
6. Update `sources:`, `last_synced`, `claims:` when relevant, and
   `## Change Log`.
7. Run lint mode before handoff.

### Lint

Use when checking wiki consistency without edits.

1. Read [references/index.md](references/index.md).
2. Run from repo root:
   - `npm run wiki-lint-check`
   - `npm run wiki-claims-check`
3. Apply manual checks the scripts cannot fully prove:
   - contradictions between `## Current Belief` sections
   - body link resolution
   - source files changed after `last_synced`
4. Output blocking findings and warnings. Do not edit files in lint mode.

### Capture

Use when a session answer should become durable repo belief.

1. Confirm the target `README/Wiki/<topic>/<page>.md` path with the user unless
   they already gave an exact path.
2. Use `README/Templates/Wiki-template.md` for new pages.
3. Record provenance in `sources:`; do not let generated wiki text cite itself.
4. Update `last_synced` and `## Change Log`.
5. Run lint mode before handoff.

### Contradictions Report

Use when semantic drift matters after wiki changes or before merge.

1. Preview candidate pairs:
   - `npm run wiki-contradictions-report -- --dry-run`
2. With `GEMINI_API_KEY` set, run the report:
   - `npm run wiki-contradictions-report`
3. Read `tmp/wiki-contradictions/report.md` unless `--out` was provided.
4. Treat the report as evidence to review, not an automatic edit command.

## Output Contract

- State the mode used.
- List wiki files changed or checked.
- List commands run and pass/fail status.
- For edits, summarize source provenance and `last_synced` changes.
- For lint/report-only work, keep findings grouped by blocking vs warning.

## Design Defaults

- Markdown first: portable, diffable, and easy for humans to review.
- Deterministic checks before semantic reports.
- Canonical sources remain the evidence; wiki pages are synthesis.
- No silent memory magic: durable behavior belongs in checked-in docs, scripts,
  or skills.

## References

Read [references/index.md](references/index.md) first.

## Handoff Rules

- Hand off to `markdown` for formatting-only cleanup.
- Hand off to `write-notes` for session notes or incident records.
- Hand off to `guide-ingest` for raw external research imports.
