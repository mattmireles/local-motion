# Project skills (canonical)

Skills live under `skill-name/SKILL.md` with YAML frontmatter.

**Single source of truth:** **`.claude/skills/`** is the only real tree—create, edit, and review skills here.

**Mirrors (symlinks):**

- **`.agents/skills`** → `../.claude/skills`
- **`.cursor/skills`** → `../.claude/skills`

Do not duplicate skill directories under `.cursor` or `.agents`; both resolve to this folder.

## Cursor on this machine

**Personal Cursor skills** should read the same tree as this repo:

```bash
ln -sfn /Users/mm/Documents/GitHub/gist/.claude/skills ~/.cursor/skills
```

Generic Cursor/Codex helper skills should stay in global or plugin skill roots
unless they encode Gist-specific policy. Keep this tree focused on repo-local
workflows: extension, backend, reader/audio, deploy, wiki, experiments, and
documentation.

## Why Cursor still shows extra skills

Cursor **merges several roots**. Even with **`~/.cursor/skills`** pointed at this repo, you will still see **plugin** skills under **`~/.cursor/plugins/.../skills/`** (Vercel, Cloudflare, Sentry, Supabase, and so on). Those bundles are **not** duplicates of this repo—they ship with each plugin.

**Claude Code (global):** **`~/.claude/skills`** is separate unless you symlink it to this repo as well (that affects **all** projects that use Claude Code on this machine).
