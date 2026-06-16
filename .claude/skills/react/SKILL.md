---
name: react
description: >-
  Authors and debugs React code on Cloudflare (Workers static assets, Pages, React Router v7, Hono, Vite, SSR, client bundles). Use when writing or fixing React UI, hydration, Wrangler assets config, edge routes, fetch/CORS, R2 uploads, or Workers limits affecting the frontend in this repo—not for deploy-only tasks (use deploy) or non-React Cloudflare backends alone (use cloudflare).
---

# React on Cloudflare (Gist)

## Purpose

**Primary reference:** [`README/Guides/backend/Cloudflare/React-Cloudflare-guide.md`](../../../README/Guides/backend/Cloudflare/React-Cloudflare-guide.md) — stack choice (Pages vs Workers + assets), **React Router v7 + Hono + Vite**, Wrangler `assets` / SPA routing, storage bindings, caching, limits, hydration, and security (including RSC-related notes).

Read that guide **before** improvising patterns; it links the developer field guide, storage guide, and official Cloudflare framework docs.

## Use When

- Implementing or debugging **React** in **`packages/ui`** or other app surfaces that target **Cloudflare**.
- **SSR / hydration** mismatches, **client vs server** bundle boundaries, or **Tree-shaking** / large imports on Workers.
- **Wrangler** `assets`, `run_worker_first`, `not_found_handling`, `nodejs_compat`, or **Pages** vs **Workers** routing confusion.
- **Edge APIs** next to the UI (**Hono**, JSON routes, JWT, CORS) or **R2 presigned uploads** from React.
- **Workers errors** tied to the UI path: **1101** (no response), **1102** (memory), bundle size, **HTML Auto Minify** vs hydration.

## Do Not Use When

- **Deploy, migrations, CI gates** — use **`deploy`**.
- **Workers/D1/R2/Queues without a React angle** — use **`cloudflare`** (still link [`React-Cloudflare-guide.md`](../../../README/Guides/backend/Cloudflare/React-Cloudflare-guide.md) from there when relevant).
- **Shared LLM workflow service boundary** — [`shared-llm-workflow-runtime-service-guide.md`](../../../README/Guides/backend/shared-llm-workflow-runtime-service-guide.md).

## Procedure

1. **Open** [`React-Cloudflare-guide.md`](../../../README/Guides/backend/Cloudflare/React-Cloudflare-guide.md) and follow its **Executive summary** and sections that match the task (routing, data, R2, caching, limits, security).
2. **Confirm current APIs** with **Context7 MCP** (React, React Router, Vite, Hono) or Cloudflare docs MCP when behavior or flags may have changed.
3. **Align with repo layout** — this repo’s Wrangler project is `packages/backend/wrangler.toml`; this repo’s frontend surfaces are in `packages/ui`. Do not assume Next.js defaults on Cloudflare unless the codebase explicitly uses an adapter.

## Performance checklist

Use this inside the `react` skill rather than loading a second React performance
skill. Treat Vercel-style React guidance as a **checklist**, not as framework
defaults, and ignore Next.js-specific advice unless the task actually targets a
Next.js surface.

Check these first:

- **Avoid waterfalls:** start async work early, await late, and parallelize
  independent requests.
- **Protect bundle size:** prefer direct imports, lazy-load heavy UI, and defer
  third-party code until it is needed.
- **Reduce re-renders:** memoize expensive subtrees, keep effect dependencies
  primitive and honest, and subscribe to derived state rather than large raw
  objects.
- **Keep rendering cheap:** hoist static JSX, use ternaries instead of ambiguous
  `&&` rendering, and animate wrappers rather than heavy SVG internals.
- **Simplify client code:** batch DOM/class changes, use `Map`/`Set` for hot
  lookups, and collapse repeated loops when it materially improves clarity.
- **Apply Cloudflare judgment:** performance patterns cannot fight Worker
  limits, hydration boundaries, or asset-routing constraints from the main
  guide.

If the task is mainly a performance review, call out findings under these
headings: waterfalls, bundle size, re-renders, rendering cost, and client-side
complexity.

## Quick anchors (from the guide)

| Topic | Where to look first |
| --- | --- |
| Pages vs Workers + static assets | Guide § Cloudflare Pages vs Workers |
| Scaffold (C3 + React Router) | Guide § Recommended stack; official React Router on Workers |
| `wrangler.jsonc` assets / SPA | Guide § Wrangler: static assets and SPA behavior |
| D1 batch, KV, DO, Hyperdrive | Guide § Data and storage; linked DB/storage guides |
| R2 direct upload + CORS | Guide § R2 uploads |
| Cache / SSR headers | Guide § Caching |
| Hydration / Auto Minify | Guide § Limits, errors, and debugging |
| JWT at edge (Hono) | Guide § Security |

## Handoff

| Need | Skill / doc |
| --- | --- |
| UI direction, hierarchy, restraint, product-surface judgment | **`jony-ive`** |
| Animation systems, motion tuning, or design critique | **`interface-craft`** |
| Reader-facing copy or CTA wording | **`david-ogilvy`** |
| Broader Workers platform (no React-specific task) | **`cloudflare`** |
| Ship to Cloudflare, staging/prod | **`deploy`** |
| Full React–Cloudflare patterns | [`React-Cloudflare-guide.md`](../../../README/Guides/backend/Cloudflare/React-Cloudflare-guide.md) |
