---
name: cloudflare
description: >-
  Route Cloudflare questions in this repo to checked-in guides first, then live docs. Use when the task involves Workers, Wrangler, D1, R2, Durable Objects, Queues, KV, Workflows, or platform semantics for Gist—not for deploy scripts alone (use deploy) or the shared LLM workflow service boundary (see README/Guides/backend/shared-llm-workflow-runtime-service-guide.md). For Workflows semantics (steps, replay, limits), start with README/Guides/backend/Cloudflare/Cloudflare-Workflows-guide.md. Encourages Context7 MCP or Cloudflare docs MCP for up-to-date APIs; repo guides for depth and local conventions.
---

# Cloudflare (Gist)

## Purpose

**This repo** keeps long-form Cloudflare context under [`README/Guides/backend/Cloudflare/`](../../../README/Guides/backend/Cloudflare/). Use [`Cloudflare-services-catalog-guide.md`](../../../README/Guides/backend/Cloudflare/Cloudflare-services-catalog-guide.md) when choosing which Cloudflare product may fit a new need; use the field guides for architecture, tradeoffs, and “why things break.” Use **live documentation** when you need exact current API shapes, limits, or CLI flags. For **Cloudflare Workflows** (durable workflows, steps, replay, failure modes), read [`Cloudflare-Workflows-guide.md`](../../../README/Guides/backend/Cloudflare/Cloudflare-Workflows-guide.md) before wiring new orchestration.

## Use When

- Implementing or debugging **Workers**, **bindings**, **D1**, **R2**, **KV**, **Queues**, **Wrangler**, **Email Routing**, or **Cloudflare Workflows** in this codebase.
- You need **background** on the platform (isolates, limits, storage patterns) beyond a one-line fix.
- **Agents SDK** or durable coordination patterns that belong in the Cloudflare field guides.
- **Workflows** orchestration (steps, `step.do`, sleep, retries, limits) — primary reference: [`Cloudflare-Workflows-guide.md`](../../../README/Guides/backend/Cloudflare/Cloudflare-Workflows-guide.md).

## Do Not Use When

- **Shipping or migrations** — use **`deploy`** (generated artifacts, gates, backend Worker/Firebase deploy path).
- **What belongs in the shared `llm-workflows` service vs a Gist worker or client** — read [`shared-llm-workflow-runtime-service-guide.md`](../../../README/Guides/backend/shared-llm-workflow-runtime-service-guide.md) first when that shared runtime boundary is in scope.

## Procedure

1. **Start with the right guide** (paths from repo root):
   - [Cloudflare-services-catalog-guide.md](../../../README/Guides/backend/Cloudflare/Cloudflare-services-catalog-guide.md) — service catalog and selection matrix for discovering what Cloudflare offers.
   - [Cloudflare-Developer-Field-Guide.md](../../../README/Guides/backend/Cloudflare/Cloudflare-Developer-Field-Guide.md) — platform overview, Workers, Wrangler loop.
   - [Cloudflare-db-storage-guide.md](../../../README/Guides/backend/Cloudflare/Cloudflare-db-storage-guide.md) — storage/DB survey and patterns.
   - [Cloudflare-D1-guide.md](../../../README/Guides/backend/Cloudflare/Cloudflare-D1-guide.md) — D1.
   - [Cloudflare-R2-guide.md](../../../README/Guides/backend/Cloudflare/Cloudflare-R2-guide.md) — R2.
   - [Cloudflare-DO-guide.md](../../../README/Guides/backend/Cloudflare/Cloudflare-DO-guide.md) — Durable Objects.
   - [cloudflare-workers-kv-guide.md](../../../README/Guides/backend/Cloudflare/cloudflare-workers-kv-guide.md) — KV.
   - [Cloudflare-Queues-guide.md](../../../README/Guides/backend/Cloudflare/Cloudflare-Queues-guide.md) — Queues.
   - [Cloudflare-Workflows-guide.md](../../../README/Guides/backend/Cloudflare/Cloudflare-Workflows-guide.md) — Workflows (replay, steps, limits, failure modes).
   - [Cloudflare-email-guide.md](../../../README/Guides/backend/Cloudflare/Cloudflare-email-guide.md) — Email Routing / workers handling email.
   - [Cloudflare-Agents-SDK-guide.md](../../../README/Guides/backend/Cloudflare/Cloudflare-Agents-SDK-guide.md) — Agents SDK on Workers.
   - [Cloudflare-containers-guide.md](../../../README/Guides/backend/Cloudflare/Cloudflare-containers-guide.md) — Containers and Sandbox SDK (heavy compute, images, FFmpeg/ML patterns).
   - [Stripe-Cloudflare--guide.md](../../../README/Guides/backend/Cloudflare/Stripe-Cloudflare--guide.md) — Stripe + Cloudflare integration notes.
   - [React-Cloudflare-guide.md](../../../README/Guides/backend/Cloudflare/React-Cloudflare-guide.md) — React Router, Hono, static assets, edge React patterns.
2. **Confirm current behavior** with **Context7 MCP** (library/docs lookup) or, if configured, **Cloudflare’s Documentation MCP** (`https://docs.mcp.cloudflare.com/mcp` per Cloudflare’s docs). Prefer these over stale training data for API details.
3. **Bind this repo’s truth** in code: [`packages/backend/wrangler.toml`](../../../packages/backend/wrangler.toml) and sibling `packages/*/wrangler.toml` files if present; typed env in [`packages/backend/src/env.ts`](../../../packages/backend/src/env.ts) and other `packages/*/src/env.ts` files as applicable.

## Handoff

| Need | Skill / doc |
| --- | --- |
| Substack custom domain (reverse proxy, HTMLRewriter, `connect.sid` on edge) | **`substack`** |
| Deploy, CI parity, staging vs prod | **`deploy`** |
| Shared LLM workflow **service** boundary, queues/replay at that boundary, client vs service | [`shared-llm-workflow-runtime-service-guide.md`](../../../README/Guides/backend/shared-llm-workflow-runtime-service-guide.md) |
| Cloudflare Workflows product semantics (steps, replay, limits, failure modes) | [`Cloudflare-Workflows-guide.md`](../../../README/Guides/backend/Cloudflare/Cloudflare-Workflows-guide.md) |
| Gemini / Vertex on Cloudflare in this repo | **`gemini-pipeline`** |
| Optional upstream Cloudflare agent skills | `npx skills add https://developers.cloudflare.com` |
