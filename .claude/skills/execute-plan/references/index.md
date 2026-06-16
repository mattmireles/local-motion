# Execute Plan References

**Git cadence:** phase **commits** repeat per completed phase; **`git push`**
and the **`git-push`** skill run **once after all phases** when authorized. Do
not push after each phase unless the user explicitly overrides.

Canonical docs for `execute-plan` in Local Motion:

- `README/Templates/Plans-template.md` for the plan contract.
- The concrete checked-in plan file under `README/Plans/`.
- `README.md` and directly linked `README/Guides/...` files for product context.
- `README/Notes/...` only when notes exist and are linked by the plan.

Before updating plan checkboxes or committing, inspect changed files and the
verification output for the active phase. If external phase-audit helper scripts
are absent, run `phase-audit` locally or launch readonly Cursor subagents with
the same phase scope.
