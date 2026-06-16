---
name: deploy
description: Package and release Local Motion as a VS Code/Cursor extension. Runs the local release gate (`npm run check`, `npm run lint`, `npm test`, `npm run package`) and prepares a VSIX or marketplace publish path when explicitly requested. Does not deploy Cloudflare, Firebase, Chrome Web Store, or any old external infrastructure.
---

# Deploy

## Purpose

Use this skill when the user asks to **deploy**, **ship**, **release**, or package
Local Motion. In this repo, deploy means extension release readiness: prove the
single-package TypeScript extension, build a VSIX, and only publish when the user
explicitly asks for marketplace publication.

## Surfaces

| Surface | Location | Release action |
| --- | --- | --- |
| Extension source | `src/` | `npm run check`, `npm run lint`, `npm test` |
| VS Code manifest | `package.json` | verify commands, activation events, configuration, and provider contribution |
| VSIX package | repo root | `npm run package` |
| Cursor setup | setup UI / proxy instructions | manual Extension Development Host smoke when changed |

## Procedure

1. Read [`README.md`](../../../README.md) and the Local Motion guide when release
   behavior is unclear.
2. Install dependencies if needed with `npm install`.
3. Run the blocking gate from repo root:
   - `npm run check`
   - `npm run lint`
   - `npm test`
4. Build the package:
   - `npm run package`
5. If the user asked for publishing, confirm the target first:
   - VS Code Marketplace (`vsce publish`) requires authenticated publisher access.
   - Open VSX, if desired, is a separate explicit target.
6. Do not push, merge, or publish unless the user explicitly asked for that side
   effect.

## Anti-Patterns

- Running previous-product commands such as `wrangler`, Firebase deploys,
  `npm run verify:generated`, or workspace-only scripts. This repo has one root
  `package.json`.
- Treating `npm run package` as proof that runtime setup works when the change
  touched `llama-server`, downloads, streaming, or Cursor proxy behavior.
- Publishing a VSIX or marketplace release from a dirty or ambiguous tree without
  surfacing what will ship.

## Related Skills

- `local-motion` for domain-specific runtime and setup behavior.
- `audit` for broad release-risk review.
- `git-push` only when the user explicitly wants remote Git side effects.
