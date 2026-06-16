# Substack references

Canonical docs for **`substack`**. Read only what matches your seam.

## Write API

- `README/Guides/content/substack-posting-guide.md`
  Unofficial `/api/v1` publishing: `connect.sid`, ProseMirror `draft_body`,
  draft/prepublish/publish, images, Notes, Workers deployment, footguns, OSS map
  (§14). **Default for syndication and API reverse-engineering.**

## Edge proxy

- `README/Guides/content/Customizing-Substack-frontend-Cloudflare-guide.md`
  Worker reverse proxy, `Host` rewrite, `Set-Cookie`, HTMLRewriter SEO, React
  hydration, synthetic monitoring. **Default for branded hostname / read path.**

## DOM fixtures

- `README/Notes/auto-gist/Examples/Substack/positive/substack-article_p_god-mode.html`
  — standard article DOM.
- `README/Notes/auto-gist/Examples/Substack/positive/www.notboring.co-_p_the-electric-slide.html`
  — long-form article on custom Substack hostname.
- `README/Notes/auto-gist/Examples/Substack/negative/substack-profile.html`
- `README/Notes/auto-gist/Examples/Substack/negative/substack-_profile_edit.html`

## Repo code touchpoints

Search when implementing, not for API truth:

- `packages/chrome-plugin/extension/content/scraper/extractors/markdown.js` —
  Substack markdown extraction.
- `packages/chrome-plugin/extension/background/auto-gist/` — page-type and gating
  on Substack URLs.
- `packages/backend/src/lib/web-markdown/cloudflare-markdown-provider.ts` —
  server-side markdown for Substack URLs.

## Related notes

- `README/Notes/backend/web-create-debug-notes.md` — duplicate Substack gists /
  body-signature section (search `Substack`).

## Cloudflare (supporting)

- `README/Guides/backend/Cloudflare/Cloudflare-Developer-Field-Guide.md`
- `README/Guides/backend/Cloudflare/React-Cloudflare-guide.md` — HTMLRewriter +
  hydration

## External oracle (community)

- [ma2za/python-substack](https://github.com/ma2za/python-substack) — reference
  write client; validate wire format against your DevTools capture.
