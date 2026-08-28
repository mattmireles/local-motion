# Create Plan References

Canonical docs for `create-plan` in Local Motion.

## Plan Filename And Id

- New plans use a **monotonic numeric prefix** and kebab-case slug at the Plans root:
  `README/Plans/{id}-{kebab-slug}.md`.
- Pick the next id as one plus the maximum leading numeric prefix among
  `README/Plans/[0-9]*.md` files.
- Zero-pad to three digits below 1000, matching the existing plan style.
- Do not create category symlinks unless the repo later adds a documented plan
  index layout.

## Docs To Read

- `README.md` for the current product surface.
- `README/Guides/vs-code-local-ai-hugging-face-guide.md` for architecture.
- `assets/Plans-template.md` (canonical; README/Templates is a symlink) for plan structure.
- Existing neighboring plans under `README/Plans/` for naming and verification style.

## Cross-Links

- Link to other plans with stable repo paths such as
  `README/Plans/001-cursor-model-picker-setup-plan.md`.
- Guides and notes may use `README/Guides/...` and `README/Notes/...` paths.
