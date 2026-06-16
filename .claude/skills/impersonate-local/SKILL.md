---
name: impersonate-local
description: >-
  Boots local Gist auth/session workflows for manual testing, opens a local-only browser login
  route for LOCAL_IMPERSONATE_EMAIL, and leaves the developer logged in with the local worker
  session. Use for local logged-in dev when full OAuth is impractical.
---

# Impersonate local (Gist)

## When this applies

- User wants **local dev** with a **real session cookie** without email magic link or Google OAuth.
- User references **impersonate-local**, **use impersonate-local**, or **local impersonation**.

## Contract

`npm --workspace=@gist/backend run dev` should just work from the repo root:

1. Apply local D1 migrations.
2. Start one Wrangler dev process for **API + pipeline** so local queues have both producer and consumer.
3. Start Vite on the first free **`localhost`** port in **`5173..5193`**.
4. Repair and verify known local D1 drift before opening the browser.
5. Open **`/auth/dev/impersonate`** on the chosen Vite origin.

The browser login route is intentionally boring:

- **`GET /auth/dev/impersonate`** is the default local developer path.
- It only works when **`ENVIRONMENT=local`** and `request.url` is loopback.
- It requires **`LOCAL_IMPERSONATE_EMAIL`** in repo-root **`.env`**.
- It idempotently creates or completes the local user row without deleting episodes, sessions, profile data, or cloned staging rows.
- It sets a local worker session and redirects to **`/`**.

The old token-mint POST path is gone. Scripted callers use the same local-only GET route as the browser workflow.

## One-command flow

From the **repository root**:

```bash
npm --workspace=@gist/backend run dev
```

Required `.env` key:

- **`LOCAL_IMPERSONATE_EMAIL`** — the local account to log in as. If the row is missing, the route creates it.

Optional `.env` keys:

- **`LOCAL_IMPERSONATE_USER_ID`** — stable local D1 user id; defaults to **`usr_local_impersonate`**.
- **`LOCAL_IMPERSONATE_NAME`** — display name for a newly ensured local row.
- **`LOCAL_IMPERSONATE_INBOUND_HOST`** or **`INBOUND_EMAIL_HOST`** — local alias host; defaults to **`rst.test`**.
- Provider keys such as **`WORKFLOW_RUNTIME_TOKEN`**, **`CLAUDE_API_KEY`**, Gemini/Vertex, and **`ELEVENLABS_API_KEY`** when exercising real episode generation.

The launcher writes **`tmp/cursor-impersonate.md`** for the exact chosen app origin. If **`5173`** is busy, trust that file instead of guessing the port.

## Useful commands

```bash
npm --workspace=@gist/backend run dev
npm --workspace=@gist/backend run typecheck
```

**Legacy helper scripts are not present in this checkout.** Use your local bootstrap tooling and keep data operations non-destructive unless a command explicitly documents cleanup.

## Clone staging content into local data

Local D1 does not mirror staging. To populate local episode cards:

```bash
# Add repo-equivalent clone helpers only if your branch includes a maintained local data mirror flow.
```

Optional env: **`STAGING_CLONE_EMAIL`** (defaults to **`LOCAL_IMPERSONATE_EMAIL`**), **`LOCAL_CLONE_USER_ID`** (defaults to **`LOCAL_IMPERSONATE_USER_ID`**, then **`usr_local_impersonate`**), **`CLONE_EPISODE_LIMIT`** (default `20`).

The clone helper copies episode rows only. The R2 helper then pulls referenced audio/text objects into Miniflare local R2.

## Troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| **404** “Local impersonation is not available” | Worker is not **`ENVIRONMENT=local`** or `request.url` is not loopback | Use `npm --workspace=@gist/backend run dev`; keep `dev.host = "localhost"` in participating Worker configs |
| **404** “set LOCAL_IMPERSONATE_EMAIL” | Missing repo-root `.env` key | Set `LOCAL_IMPERSONATE_EMAIL` |
| **`/auth/me` 401** after login | Wrong browser context or host mix | Reopen `tmp/cursor-impersonate.md` and stay on its exact `http://localhost:<port>` origin |
| Home/API 500 after login | Local D1 drift | Re-run local bootstrap and verify local bindings are initialized for your environment |
| Episodes stay queued | API-only mode or missing provider/workflow keys | Do not set `IMPERSONATE_LOCAL_API_ONLY=1`; add the runtime/provider keys needed by the pipeline |

## Agent procedure

1. Confirm repo-root **`.env`** exists and **`LOCAL_IMPERSONATE_EMAIL`** is non-empty. Do not echo secrets or real emails.
2. Prefer **`npm --workspace=@gist/backend run dev`**. It owns dynamic ports and passes matching `APP_BASE_URL` / `INBOUND_EMAIL_HOST` vars into Wrangler when the package script supports that local bootstrap.
3. If dev is already running, use the exact URL in **`tmp/cursor-impersonate.md`**.
4. Verify the real path with your local auth smoke check or `/api/auth/session` probe.
5. For local data setup, use your repository’s bootstrap flow. Do not use destructive reset behavior unless a separate command explicitly says reset.

## Do not

- Commit real emails into the repo.
- Enable **`LOCAL_IMPERSONATE_*`** in staging/production Worker env.
- Assume staging DB state exists locally.
- Reintroduce generated helper HTML, clipboard secrets, or a required human click before the login route can set the cookie.

## Code pointers

- Handler: `packages/backend/src/api/routes/auth.ts`
- Route registration: `packages/backend/src/api/index.ts`
- Worker session materialization: `packages/backend/src/lib/worker-sessions.ts`
- Optional local bootstrap scripts: `packages/backend/scripts/` (if present) or top-level `scripts/`

**Skills layout:** **`.cursor/skills`** and **`.agents/skills`** symlink to **`.claude/skills`**; edit **`.claude/skills/impersonate-local/`** only.
