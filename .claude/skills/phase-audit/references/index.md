# Phase Audit References

Canonical docs for `phase-audit` in Local Motion:

- `README/Templates/Plans-template.md` when validating plan phase structure,
  checkbox state, and verification text.
- The active plan file under `README/Plans/`.
- `README.md` and directly linked `README/Guides/...` files for product context.
- `README/Notes/...` only when notes exist and constrain the phase.

Always inspect the active phase, changed files, and checks that were actually
run. Local gate readiness means `npm run check`, `npm run lint`, and `npm test`
where relevant.
