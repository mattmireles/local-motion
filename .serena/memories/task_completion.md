# Task Completion

- For source changes: run `npm run check`; add `npm run lint` and `npm test` when logic, API contracts, downloader/runtime, or UI behavior changed.
- For release/package changes: run `npm run package` after `check`, `lint`, and `test` pass.
- For markdown-only changes: inspect rendered structure mentally and run available markdown tooling only if added later; no markdown lint script exists now.
- After substantive edits in Cursor, use IDE lints for changed files when available.
- Do not claim runtime behavior is fixed without a concrete proof path: passing test, clean compile/lint, or an Extension Development Host/manual repro check.