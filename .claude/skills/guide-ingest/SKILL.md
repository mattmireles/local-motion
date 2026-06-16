---
name: guide-ingest
description: >-
  Ingests offline deep-research exports into README guides: converts to clean
  markdown, verifies library/API claims with Context7 MCP, adds cross-links to
  README/Guides and README/Notes, and updates related docs to link back. Use
  when adding or refreshing a guide from browser-downloaded research, Deep
  Research output, or similar raw material; when the user says guide-ingest,
  research-to-guide, or wants corpus cross-linking for a new guide.
---

# Guide ingest

## Purpose

Turn raw, offline research into a **durable repo guide** that matches Local
Motion markdown conventions, reflects **current** library and platform facts where
Context7 can verify them, and sits correctly in the **bidirectional** web of
`README/Guides/` and `README/Notes/`.

## Use When

- Importing deep-research (or similar) output into `README/Guides/...`.
- The user invokes **guide-ingest**, **research-to-guide**, or the same workflow
  in natural language.
- A new guide needs **outbound** links to notes/guides and **inbound** links
  from existing docs.

## Do Not Use When

- The task is only a small markdown typo fix (use **`markdown`**).
- The task is only where to put a note (use **`write-notes`**).
- The work is inline code documentation (use **`documentation`**).

## Prerequisites

- **Context7 MCP** available for `resolve-library-id` / `get-library-docs` (or
  the repo’s equivalent Context7 tools). Read the tool schema in the MCP
  descriptors **before** calling tools.
- Raw source: path or pasted content the user downloaded from the browser.

## Procedure

### 1. Normalize to proper markdown

1. Read the **`markdown`** skill and
   [README/Templates/guide-template.md](../../../README/Templates/guide-template.md)
   for guide structure.
2. Produce guide-shaped markdown:
   - real markdown links, not bare URLs
   - blank lines around headings and lists
   - language-tagged fences where applicable
   - single trailing newline; no unnecessary HTML
3. Add a short top-of-file purpose blurb if the template or sibling guides use
   one; match the tone of nearby guides in the same folder.

### 2. Verify claims with Context7 (fix stale deep-research)

1. Extract **verifiable** claims: library APIs, CLI flags, framework behavior,
   config keys, deprecation notices, default versions, and similar **documented**
   facts.
2. For each claim, use Context7: resolve the library/tool ID, then pull the
   relevant docs. Prefer **current** official behavior over the research draft.
3. **Update the guide** when Context7 contradicts the export: correct API
   names, replace deprecated patterns, fix version-specific statements.
4. For claims **outside** Context7’s scope (product strategy, subjective
   opinion, internal Local Motion behavior not in public docs), do **not** fake
   verification. Either leave as non-factual narrative, mark as
   opinion/heuristic, or point to a repo note/guide that is authoritative.

### 3. Add outbound links (guides and notes)

1. While reading sections, identify concepts that already have a home in
   **`README/Guides/`** or **`README/Notes/`**.
2. Add **inline** markdown links on the first strong mention in each section (or
   a compact “See also” list if inline would clutter). Use **repo-relative**
   paths from the new guide file (e.g. `../../../Notes/foo.md`).
3. Prefer linking to **one canonical** guide per topic rather than duplicating
   long explanations.

### 4. Add inbound links (corpus updates)

Goal: related docs **point back** to the new guide so agents discover it from
both directions.

1. **Discover candidates**: search `README/Guides/` and `README/Notes/` for
   overlapping keywords, product names, library names, and headings (e.g.
   ripgrep). Include files that already link to adjacent topics.
2. **Edit sparingly**: add a link in “Related”, “See also”, or the most
   relevant paragraph—**minimal** diff, no drive-by rewrites.
3. If a high-level notes file covers the same subsystem, add a short bullet or
   sentence there with a link to the new guide (see **`write-notes`** for
   consolidation habits).

### 5. Close the loop

1. Run markdown lint for touched files if repo scripts exist (`npm` /
   `markdown` skill).
2. Give the user a **short summary**: what was corrected via Context7, which
   files gained inbound links, and any claims left unverified.

## Handoff Rules

| Situation | Hand off to |
|-----------|-------------|
| Repo markdown rules, lint, structure | **`markdown`** |
| Local Motion extension/runtime guides or research | **`local-motion`** |
| Where a note should live, note sprawl | **`write-notes`** |
| JSDoc / code comments | **`documentation`** |

## References

- [Guide template](../../../README/Templates/guide-template.md)
- [Notes template](../../../README/Templates/Notes-template.md)
