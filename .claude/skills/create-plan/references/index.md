# Create Plan References

Canonical docs for `create-plan`.

## Plan filename and id

- New plans use a **monotonic numeric prefix** and kebab-case slug at the **Plans root** (canonical):
  `README/Plans/{id}-{kebab-slug}.md` (for example
  `README/Plans/216-my-feature-plan.md`).
- The id is **global** across all plans (including `.archive`), not per category folder.
- Pick the next id as **one plus the maximum** leading numeric prefix among **canonical**
  files only:

  ```bash
  find README/Plans -maxdepth 1 -name '[0-9]*.md' -type f
  ```

  Do not scan category symlinks (`find` without `-maxdepth 1` duplicates paths).
  If tools are unavailable, infer from neighboring high-numbered plans and recheck before saving.
- **Zero-pad to three digits** when the new id is below 1000
  (`042-feature-plan.md`, `184-foo-plan.md`) so new files stay aligned with
  current repo style. Do not reuse ids.

## Category symlink (browse path)

After saving the canonical plan, add **one** relative symlink in the most specific
existing category subdirectory (for example `README/Plans/features/content/`):

```bash
ln -sf ../216-my-feature-plan.md README/Plans/features/content/216-my-feature-plan.md
```

Use `../` repeated to reach the Plans root from nested folders (see
[README/Plans/README.md](../../../README/Plans/README.md)).

## Cross-links

- Link to other plans with stable repo paths:
  `[Plan 200](README/Plans/200-reader-audio-server-tts-plan.md)` — not
  `../features/content/...` relative paths.
- Guides and notes may keep relative `README/Guides/...` / `README/Notes/...` links.

## Docs to read

- `README/Guides/integrations/plan-workflow-skills-guide.md`
- `README/Templates/Plans-template.md`
- `README/Plans/README.md` — layout and symlink convention
- `README/Skills-index.md` — when the plan touches repo skills
- `README/Skills-guide.md` — when creating or modifying skills

Also inspect:

- the most relevant `README/Guides/...` and `README/Notes/...` files for the
  task domain
- neighboring plans in the target **category symlink folder** for local style and
  naming patterns (canonical files are at `README/Plans/` root)
