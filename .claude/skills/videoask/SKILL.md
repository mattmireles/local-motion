---
name: videoask
description: >-
  Work on the sibling /Users/mattmireles/Documents/Github/videoask project and
  the Gist /feedback integration. Use whenever a task mentions videoask,
  VideoAsk, github/videoask, gist.is/feedback, next.gist.is/feedback, the
  feedback voice-note recorder, greeting video, respondent page, iframe embed,
  R2 upload-url failures, Postmark videoask replies, ffmpeg/telepathic-audio
  processing, or debugging/iterating on this code.
---

# Videoask

## Purpose

Use this skill for the standalone `videoask` Cloudflare Worker/Vite app and its
Gist `/feedback` mount. Keep the work simple: same Worker, same D1 forms, same
same-origin API paths, no multi-tenant rewrite unless explicitly requested.

## First Read

Start here before changing code:

1. `/Users/mattmireles/Documents/Github/videoask/AGENTS.md`
2. `/Users/mattmireles/Documents/Github/videoask/README.md`
3. `/Users/mattmireles/Documents/Github/videoask/README/Plans/02-videoask-embed-and-multi-domain-plan.md`

For visual/copy work on `gist.is/feedback`, also read:

- `/Users/mattmireles/Documents/Github/videoask/README/Gist-feedback-branding-README.md`

For Gist-side `/feedback` shell work, read:

- `/Users/mattmireles/Documents/Github/gist/packages/backend/src/ssr/feedback-shell.ts`
- `/Users/mattmireles/Documents/Github/gist/packages/backend/tests/ssr/feedback-shell.test.ts`

## Project Map

Videoask repo:

- `src/server/index.ts` - Hono Worker entry, queue, scheduled wiring.
- `src/server/routes/forms.ts` - `GET /api/forms/:slug` bootstrap.
- `src/server/routes/upload-url.ts` - `POST /api/upload-url`, R2 signed PUT.
- `src/server/routes/submit.ts` - `POST /api/submit`.
- `src/server/processing/process-submission.ts` - ffmpeg -> telepathic-audio -> Postmark orchestration.
- `src/server/lib/request-base-url.ts` - request-aware canonical origin.
- `src/server/lib/r2.ts` - R2 signed GET/PUT helpers.
- `src/server/lib/postmark.ts` - reply email sending.
- `src/shared/trusted-origins.ts` - allowlist for CORS, frame ancestors, and postMessage.
- `src/web/components/RespondentPage.tsx` - main respondent page.
- `src/web/components/Recorder.tsx` and `src/web/recorder.ts` - capture UI and MediaRecorder state.
- `wrangler.jsonc` - Worker, routes, D1/R2/Queue bindings, envs.
- `migrations/` - D1 schema and seeded `feedback` / `help` forms.
- `scripts/smoke-staging.ts` - staging end-to-end smoke.

Gist repo integration points:

- `packages/backend/src/ssr/feedback-shell.ts` serves the exact `/feedback` HTML shell with OG tags.
- Videoask still owns `/assets/*`, `/api/forms/*`, `/api/upload-url`, `/api/submit`, `/media/greetings/*`, and `/preview/*` through Cloudflare route specificity.
- `packages/backend/public/static/og/feedback-cover.png` is the social preview image for the Gist shell.

## Ground Truth Contracts

- `https://gist.is/feedback` and `https://next.gist.is/feedback` are the launch paths.
- The browser calls same-origin API paths: `/api/forms/:slug`, `/api/upload-url`, `/api/submit`, and `/media/greetings/*`.
- Vite emits root-relative `/assets/*`; those asset routes must reach videoask on Gist hosts.
- `gist.is/help` is already owned by Gist support. Do not route the videoask `help` slug there without an explicit product decision.
- `?embed=1` is iframe mode. Parent iframes need `allow="camera; microphone; autoplay"`.
- `postMessage` success events use source `videoask`, type `videoask:submitted`, and an allowlisted target origin. Never use `*` as the production target.
- R2 browser PUT origins must stay in sync with `src/shared/trusted-origins.ts`.
- Production deploys only when the user explicitly asks.

## Commands

Run from `/Users/mattmireles/Documents/Github/videoask`:

```bash
pnpm run check
pnpm run test:unit
pnpm run build
pnpm run dev
pnpm run health:staging
pnpm run smoke:staging -- --base-url=https://next.gist.is --skip-poll
```

Deployment and migrations:

```bash
pnpm run migrate:staging
pnpm run deploy:staging
pnpm run ship:staging
pnpm run deploy:production
pnpm run migrate:production
```

Use staging by default. Production commands require explicit user authorization.

## Debugging Workflow

1. Reproduce at the narrowest layer: page shell, form bootstrap, upload-url,
   R2 PUT, submit, queue processing, ffmpeg, telepathic-audio, or Postmark.
2. Read the relevant route/lib/component before editing. Prefer one small fix
   over changing the whole pipeline.
3. Check whether the bug is host-specific. Test `workers.dev`,
   `next.gist.is/feedback`, and `gist.is/feedback` separately when routing,
   asset, CORS, or canonical URL behavior is involved.
4. For upload failures, verify `TRUSTED_ORIGINS`, R2 CORS JSON, R2 secrets,
   `POST /api/upload-url`, and the actual browser PUT.
5. For blank pages on Gist hosts, check `/feedback` HTML, `/assets/main-*.js`,
   `/assets/main-*.css`, and Cloudflare route specificity before touching React.
6. For missing emails, inspect queue state and `process-submission.ts`, then
   the ffmpeg, telepathic-audio, and Postmark clients in that order.

## Verification

Match tests to the change:

- Server route/lib changes: targeted Vitest file plus `pnpm run check`.
- Recorder/UI changes: relevant component/recorder tests plus a local browser
  smoke when media permissions or layout are touched.
- Gist shell changes: run
  `pnpm --filter @gist/backend test -- tests/ssr/feedback-shell.test.ts` from
  `/Users/mattmireles/Documents/Github/gist` if the backend test command is
  available; otherwise run the closest backend test command and report any gap.
- Route/CORS/custom-domain changes: verify with `curl` or smoke against
  `https://next.gist.is/feedback` before considering production.

## Related Skills

- Use `cloudflare` / `cloudflare:wrangler` for Workers, D1, R2, Queues, routes,
  and Wrangler behavior.
- Use `react` for React/Vite/frontend debugging.
- Use `postmark` for email template, delivery, or webhook details.
- Use `deploy` only when the user explicitly asks to ship.
