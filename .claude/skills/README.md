# Project skills (canonical)

Skills live under `skill-name/SKILL.md` with YAML frontmatter.

**Single source of truth:** **`.claude/skills/`** is the only real tree—create, edit, and review skills here.

## Repo profile

This skill tree is for **Local Motion**: a VS Code/Cursor extension that installs
and runs local GGUF coding models on macOS.

- Product surface: VS Code extension host, setup webview, VS Code Language
  Model API provider, Hugging Face GGUF discovery/downloads, `llama-server`,
  and a local OpenAI-compatible proxy for Cursor.
- Canonical docs: [`README.md`](../../README.md) and
  [`README/Guides/vs-code-local-ai-hugging-face-guide.md`](../../README/Guides/vs-code-local-ai-hugging-face-guide.md).
- Source roots: `src/` and `tests/`.
- Core gates: `npm run check`, `npm run lint`, and `npm test`.
- Release gate: `npm run package`.
- Do not run old external-product commands here: `npm run typecheck`,
  `npm run verify:generated`, `npm run auto-update:generated`, `wrangler`,
  Firebase deploys, or workspace-only scripts. This repo has one root
  `package.json`.

**Mirrors (symlinks):**

- **`.agents/skills`** → `../.claude/skills`
- **`.cursor/skills`** → `../.claude/skills`

Do not duplicate skill directories under `.cursor` or `.agents`; both resolve to this folder.

## Cursor on this machine

**Personal Cursor skills** should read the same tree as this repo:

```bash
ln -sfn /Users/mm/Documents/GitHub/local-motion/.claude/skills ~/.cursor/skills
```

Generic Cursor/Codex helper skills should stay in global or plugin skill roots
unless they encode Local Motion-specific policy. Keep this tree focused on
repo-local workflows: VS Code extension development, local model runtime,
Cursor proxy setup, planning, audit, release packaging, and documentation.

## Why Cursor still shows extra skills

Cursor **merges several roots**. Even with **`~/.cursor/skills`** pointed at this repo, you will still see **plugin** skills under **`~/.cursor/plugins/.../skills/`** (Vercel, Cloudflare, Sentry, Supabase, and so on). Those bundles are **not** duplicates of this repo—they ship with each plugin.

**Claude Code (global):** **`~/.claude/skills`** is separate unless you symlink it to this repo as well (that affects **all** projects that use Claude Code on this machine).
