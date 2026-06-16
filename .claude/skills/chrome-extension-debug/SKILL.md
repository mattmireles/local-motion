---
name: chrome-extension-debug
description: Debug live Chrome extension failures in this repo. Use when the task involves MV3 service worker lifecycle bugs, message passing failures, content script injection issues, overlay blank or flickering states, Shadow DOM CSS breakage, or OVERLAY_SLIDE delivery races. Do not use for auto-gist gating, local-index, suggestion-bar bugs, or Escape-dismiss conflicts between the suggestion bar and the reader overlay, architecture refactors, Bedrock or Gemini provider issues, or general frontend work outside the extension runtime.
---

# Chrome Extension Debug

## Purpose

Use this skill to debug real failures inside `packages/chrome-plugin/`. It is for runtime bugs, timing bugs, and extension-specific regressions, not broad redesign work.

## Use When

- The symptom is inside the Chrome extension runtime.
- The failure mentions service worker restart, message delivery, content script injection, or `runtime.lastError`.
- The overlay opens blank, flickers, double-injects, or stops updating.
- Shadow DOM styles fail to load or host-page CSS is leaking into the overlay.
- Progressive streaming or `OVERLAY_SLIDE` delivery looks out of order or missing.

## Do Not Use When

- The main task is splitting modules or redesigning architecture.
- The failure is Bedrock, Gemini, or backend-only.
- The work is ordinary web UI debugging outside the extension runtime.
- The task is local-index or auto-gist routing work. Use `auto-gist-debug` once that skill is present.

## Procedure

1. Confirm the bug is extension-scoped.
2. Read [references/index.md](references/index.md) and load only the one or two guides that match the failure mode.
3. Reduce the bug to the narrowest runtime seam:
   - service worker lifecycle
   - message passing
   - content script injection
   - CSS or Shadow DOM isolation
   - overlay streaming and progressive delivery
4. Prefer the repo's existing MV3 fix pattern over generic browser-extension folklore.
5. Re-test against the actual lifecycle trigger that tends to break MV3 code:
   - reload
   - tab navigation
   - service worker restart
   - delayed content-script bootstrap
   - late slide delivery
6. If the root cause is structural rather than operational, hand off to `extension-architecture`.

## Canonical Docs

Read [references/index.md](references/index.md) first. It points to the canonical guide set for this skill.

## Handoff Rules

- Hand off to `extension-architecture` when the fix requires changing ownership boundaries, splitting god modules, or enforcing single-path overlay rules.
- Hand off to `scraping` when the core problem is extraction logic or permissions rather than extension runtime behavior.
