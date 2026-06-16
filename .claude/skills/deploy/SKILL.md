---
name: deploy
description: Manual end-to-end ship for gist—regenerate artifacts (wiki + auto-update:generated), run the full local test suite and CI-parity gates, deploy Cloudflare Worker and Firebase Functions via CLI when needed. Does not push to GitHub or merge to main/production; bypasses CI for deployment. Defaults Worker to staging; production only on explicit request. Chrome Web Store promotion stays push-driven in GitHub unless the user asks for manual extension packaging separately.
---

# Deploy (Gist)

**Manual deploy only:** When the user says **deploy**, **ship**, or **release**, perform a **complete local/manual** path: refresh generated artifacts, run **all** repo tests and deploy-related checks, then **`wrangler` / Firebase CLI** deploys as appropriate. Do **not** `git push`, open PRs, merge to **`main`** or **`production`**, or depend on GitHub Actions to perform the deployment. GitHub remains out of scope unless the user **explicitly** asks for git/CI steps (e.g. “push and let CI deploy”).

End-to-end flow: **generated artifacts → full test gate → Cloudflare Worker → (optional) Firebase Functions**. Paths are from the **repository root** unless noted.

**Tooling:** Edit **`.claude/skills/deploy/`** only. **`.cursor/skills`** and **`.agents/skills`** symlink to **`.claude/skills`**, so Cursor and Codex resolve the same tree—see `.claude/skills/README.md`.

Canonical sources: [README.md](../../../README.md) (CI/CD, build artifacts), [`scripts/auto-update-generated-artifacts.js`](../../../scripts/auto-update-generated-artifacts.js), [`.github/workflows/deploy.yml`](../../../.github/workflows/deploy.yml), [packages/firebase-functions/README.md](../../../packages/firebase-functions/README.md).

## Surfaces (what “deploy” can mean)

| Surface | Location | How it ships (this skill) |
| --- | --- | --- |
| **Generated artifacts** | protocol, chrome-plugin, backend public reader, optional deep-pipeline JSON | Regenerate locally (`auto-update:generated`); `verify:generated` must pass—**no requirement to commit** for the Worker/Firebase CLI to run |
| **Backend API Worker** | `packages/backend` | `wrangler deploy` via [`scripts/deploy.sh`](../../../packages/backend/scripts/deploy.sh) |
| **Firebase Functions** | `packages/firebase-functions` | `firebase deploy` (credentials local; not triggered by GitHub in the main deploy workflow) |
| **Chrome Web Store ZIP** | `packages/chrome-plugin` | **Not** deployed by pushing branches in this skill. CI builds/uploads on push to **`production`** ([`deploy.yml`](../../../.github/workflows/deploy.yml)); for a local ZIP only, see [packages/chrome-plugin/README.md](../../../packages/chrome-plugin/README.md) / `package:extension` when the user asks |

Do **not** confuse this with other products’ multi-Worker/Pages stacks.

## 1) Regenerate artifacts (before Worker/Firebase deploy)

**Goal:** Same hygiene as the **`verify-generated`** CI job: wiki policy + all tracked generated bundles up to date.

From repo root:

1. **`npm ci`** (or a lockfile-consistent install).
2. **Wiki gates (blocking in CI):**
   - `npm run wiki-lint-check`
   - `npm run wiki-claims-check`
3. **Generated bundles (single orchestrator):**
   - **`npm run auto-update:generated`**

   This script ([`scripts/auto-update-generated-artifacts.js`](../../../scripts/auto-update-generated-artifacts.js)):

   - If the branch supports it: **`check:deep-pipeline`** / **`build:deep-pipeline`** for `packages/backend/workflows/deep-pipeline` when prompt hashes are stale.
   - If **`verify:generated`** fails: installs optional platform binaries (see script), then runs **`npm run build:chrome`** and **`npm run build:backend`** to refresh unified-reader outputs (protocol → extension + backend public reader).

4. **Confirm clean verification:**
   - **`npm run verify:generated`** must exit 0.

**Commits:** Manual deploy does **not** require a git commit. Commit only if the user wants tracked artifacts or history updated; never conflate “deploy ready” with “pushed to GitHub.”

**CI parity note:** Linux CI installs optional packages before Worker build (`lightningcss-linux-x64-gnu`, `@tailwindcss/oxide-linux-x64-gnu`, `@rollup/rollup-linux-x64-gnu`). On macOS, native toolchains usually suffice; if `verify:generated` fails with missing native modules, follow [README.md *Known Issue: npm Workspace Optional Dependencies*](../../../README.md#known-issue-npm-workspace-optional-dependencies).

**Optional sanity:** `npm run build` builds all workspaces that expose `build`—useful after large cross-package changes; not a substitute for `verify:generated` passing.

## 2) Pre-deploy test gate (blocking)—full suite

Do **not** deploy if these fail. Run **everything** below (not a minimal subset).

1. **`npm run verify:generated`** (must still pass after artifact step).
2. **`npm run typecheck`** (root script: backend + chrome-plugin).
3. **`npm -w packages/backend run check:worker-bundle-size`**
4. **`npm test`** — full monorepo tests per [package.json](../../../package.json): backend (incl. extension guardrails), chrome-plugin, `@gist-protocol/core`, `@gist/tts-kokoro`, `@gist/ui`, `@gist/firecrawl-proxy`.

**On failure:** fix, re-run. No lowering coverage thresholds to greenwash.

## 3) Deploy Cloudflare Worker (default staging)

**Default:** staging (`--env staging`). **Production** only if the user explicitly asks for production / prod.

From repo root:

```bash
npm run deploy --workspace=@gist/backend -- --env staging
```

Production (explicit request only):

```bash
npm run deploy --workspace=@gist/backend -- --env production
```

**What `deploy.sh` does:** backend `npm run build`, Sentry release + sourcemaps (`gist-backend`), `wrangler deploy`, then Inngest app sync for staging/production unless `SKIP_INNGEST_SYNC=1`.

**Credentials:** `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SENTRY_AUTH_TOKEN` as in CI; production Inngest signing key resolution matches [`deploy-production`](../../../.github/workflows/deploy.yml).

## 4) Deploy Firebase Functions (when needed)

**Not** run automatically in `deploy.yml`. Ship when changing **`packages/firebase-functions`** or when extraction/media pipelines need a new build in GCP.

From repo root:

```bash
npm run deploy --workspace=@gist/firebase-functions
```

Or **`deploy:all`** for every function ([`packages/firebase-functions/package.json`](../../../packages/firebase-functions/package.json)). See [packages/firebase-functions/README.md](../../../packages/firebase-functions/README.md) for secrets (`GEMINI_API_KEY`, `FUNCTION_AUTH_TOKEN`, optional Storage IAM for storage-triggered functions).

Requires **Firebase CLI** logged into the correct project (`firebase login`, `firebase use`).

**Rule of thumb:** Backend-only API changes often **do not** need a Firebase deploy. YouTube/PDF/media extraction behavior changes **do**.

## 5) Chrome Web Store (out of band for this skill)

This skill **does not** push to **`production`** to trigger CI store upload. If the user wants a **local ZIP** or manual store steps, point to [packages/chrome-plugin/README.md](../../../packages/chrome-plugin/README.md) / `package:extension`.

## Default target summary

- **Worker:** staging unless the user clearly wants production.
- **Firebase:** deploy when the change touches Functions or dependent behavior; ask if unclear.
- **Artifacts:** always refresh + `verify:generated` before Worker deploy.
- **Git:** no push/merge unless the user explicitly requests source-control or CI-driven steps.

## Anti-patterns

- **Pushing to GitHub or merging to `main`/`production`** as part of “deploy” when the user only asked to deploy—use CLI deploy only.
- Deploying the Worker without **`verify:generated` green** after artifact regeneration.
- Skipping **wiki-lint-check** / **wiki-claims-check** when mirroring CI.
- Running only a **subset** of tests—use full **`npm test`** unless the user narrows scope for a documented reason.
- **`npm run deploy:backend`** from root **without** `--env staging` or `--env production` (Inngest sync and env won’t match CI).
- Assuming Firebase deployed because the Worker deployed.

## After deploy

- Spot-check routes relevant to your change; optional Bedrock stream verify per [`deploy.yml`](../../../.github/workflows/deploy.yml) comments.
- Billing changes in production: call `GET /api/admin/environment/stripe-billing`
  with `ADMIN_API_KEY` immediately after deploy. Require `ok: true` and both
  configured Price IDs to match the expected mode, currency, amount, and
  interval before sending a real user through Checkout.
- Firebase: confirm function URLs and secrets per [packages/firebase-functions/README.md](../../../packages/firebase-functions/README.md).

## Related docs

- [README.md](../../../README.md) — **Deployment**, **Build Artifacts Tracked by Auto-Rebuild**, **CI/CD Pipeline**
- [README/Wiki/infrastructure/guides-synthesis.md](../../../README/Wiki/infrastructure/guides-synthesis.md) — index of infra/analytics guides
- [`scripts/auto-update-generated-artifacts.js`](../../../scripts/auto-update-generated-artifacts.js)
- [`scripts/verify-generated-artifacts.js`](../../../scripts/verify-generated-artifacts.js)
