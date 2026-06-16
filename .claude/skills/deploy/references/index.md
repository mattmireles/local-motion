# deploy — reference index

- [README.md](../../../../README.md) — CI/CD, auto-rebuild, build artifact list
- [`.github/workflows/deploy.yml`](../../../../.github/workflows/deploy.yml) — `verify-generated`, deploy jobs
- [`scripts/auto-update-generated-artifacts.js`](../../../../scripts/auto-update-generated-artifacts.js) — orchestrates deep-pipeline + unified-reader regeneration
- [`scripts/verify-generated-artifacts.js`](../../../../scripts/verify-generated-artifacts.js) — byte parity checks for generated files
- [`packages/backend/scripts/deploy.sh`](../../../../packages/backend/scripts/deploy.sh) — Worker build, Sentry, wrangler, Inngest
- [`packages/firebase-functions/README.md`](../../../../packages/firebase-functions/README.md) — Firebase deploy, secrets, IAM
