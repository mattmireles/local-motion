# Conventions

- Simpler is better: prefer direct helpers and clear module boundaries over extra framework layers.
- Keep files focused by Local Motion domain: extension activation, setup UI, machine/model compatibility, download, llama-server lifecycle, OpenAI proxy, Cursor integration, provider integration.
- Do not mutate Cursor private state; Local Motion shows exact Cursor OpenAI-compatible settings instead.
- Treat local model downloads and subprocess lifecycle as user-facing reliability paths: clear errors, resumable/observable progress, bounded waits, and explicit cleanup matter.
- Markdown docs should use normal Markdown links, language-tagged fences when known, blank lines around lists/headings, and a single trailing newline.