---
name: substack
description: >-
  Reverse-engineers Substack's unofficial APIs, ProseMirror publishing payloads,
  and edge-proxy patterns for branded hostnames in this repo. Use when the task
  mentions Substack, substack.com, connect.sid, draft_body, cross-posting,
  syndication, HTMLRewriter on a Substack publication, or any read/write/scrape
  path on Substack pages; invoke as substack or $substack. Do not use for
  generic scraping without Substack-specific API or DOM concerns, auto-gist
  gating only, or pure MV3 extension runtime bugs.
---

# Substack

## Purpose

Single entry point for **anything Substack** in Gist: undocumented `/api/v1`
write paths, session cookies, ProseMirror bodies, Worker reverse proxies, and
DOM fixtures for scraping or classification.

Substack has **no official write API**. Treat every endpoint as unstable;
validate with DevTools and community reference clients before production.

## Use When

- Reverse-engineering or calling Substack HTTP APIs (`/api/v1/*`).
- Publishing, drafting, Notes, images, or subscriber flows via `connect.sid`.
- Branded custom domain on Cloudflare (HTMLRewriter, cookie rewrite, hydration).
- Debugging Substack page structure, paywalls, or extraction quality.
- Planning or implementing CMS → Substack syndication.
- Ingesting or extending repo guides about Substack (with **`guide-ingest`**).

## Do Not Use When

- The task is only generic web scraping (host permissions, PDFs, YouTube) with
  no Substack API or DOM contract — use **`scraping`**.
- Auto-gist never fires, canonical URL gating, or suggestion-bar behavior on
  Substack URLs — use **`auto-gist-debug`** (may still read fixtures here).
- MV3 service worker, overlay, or message-passing failures without Substack API
  work — use **`chrome-extension-debug`**.
- Bedrock/Gemini providers or unrelated Workers — use the matching skill.

## Procedure

### 1. Classify the seam

| Seam | Typical question | Start here |
| --- | --- | --- |
| **Write** | Publish/update drafts, Notes, images | [references/index.md — write API](references/index.md#write-api) |
| **Read / edge** | Custom domain, SEO, hide chrome | [references/index.md — edge proxy](references/index.md#edge-proxy) |
| **Extract** | Article HTML/markdown for Gist | [references/index.md — DOM fixtures](references/index.md#dom-fixtures) |
| **Discover** | New endpoint or field | §4 below |

### 2. Load canonical docs

Read [references/index.md](references/index.md) and open **only** the listed
files for your seam. Do not re-derive `draft_body`, cookie rules, or hydration
constraints from memory.

### 3. Apply repo invariants

**Write path**

- `draft_body` = **stringified** ProseMirror JSON, never a nested object.
- Hot path: `POST /api/v1/drafts` → `PUT /api/v1/drafts/{id}` (body) →
  `POST /api/v1/drafts/{id}/prepublish` → `POST /api/v1/drafts/{id}/publish`.
- Default `send: false` until the caller explicitly opts into email.
- Use a dedicated bot contributor account; never the owner's primary session for automation.
- `Content-Type: text/html` on `/api/*` = expired cookie or Cloudflare challenge — alert; do not retry blindly.

**Edge / read path**

- Upstream `Host` must be `*.substack.com`; branded DNS is **proxied** (orange cloud).
- Read cookies with `headers.getAll("Set-Cookie")`; write one `append` per outbound line.
- Strip or relax `Content-Security-Policy` / `X-Frame-Options` only when required for your embed/proxy pattern.
- **CSS-hide** React-owned nodes; do not `HTMLRewriter.remove()` inside hydration roots.

**Rate**

- Stay ≤ ~1 RPS per publication; throttle client-side.

### 4. Reverse-engineering workflow

When guides do not cover the behavior:

1. Reproduce in the **web UI** on the target publication subdomain.
2. DevTools → Network → filter `api/v1`; export request/response pairs (redact cookies).
3. Compare to [ma2za/python-substack](https://github.com/ma2za/python-substack) and
   `README/Guides/content/substack-posting-guide.md` (§14 OSS map).
4. If write-related, run **prepublish** before **publish** to get structured 400s.
5. Capture a minimal repro (`fetch` or curl) and persist non-obvious findings via
   **`write-notes`** or extend guides via **`guide-ingest`**.

Do not scrape at scale to discover write APIs; capture traffic from the UI.

### 5. One change, then prove

Per repo norms: fix one seam, re-test (hard refresh, SPA navigation, second visit).
For publish flows, confirm with `GET /api/v1/posts/{slug}` when a slug exists.

## Handoff Rules

| Situation | Skill |
| --- | --- |
| Host permissions, non-Substack extractors | `scraping` |
| Auto-suggest, page-probe, local-index on Substack | `auto-gist-debug` |
| MV3 overlay, injection, message passing (not Substack API) | `chrome-extension-debug` |
| Workers limits, Browser Rendering, generic CF platform | `cloudflare` |
| Ingesting external Substack research into guides | `guide-ingest` |
| Novel API/DOM findings to persist | `write-notes` |

## Additional resources

- [references/index.md](references/index.md) — canonical guide and fixture index.
