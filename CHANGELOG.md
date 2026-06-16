# Changelog

## 0.0.1

- Initial public VSIX candidate.
- Adds `Local Motion: Open Setup` for macOS GGUF model setup.
- Profiles local machine memory and disk capacity.
- Searches Hugging Face GGUF repositories and ranks compatible quantizations.
- Downloads GGUF files with resumable streaming.
- Starts `llama-server` on `127.0.0.1` and registers the active model with the
  VS Code Language Model API.
- Provides an OpenAI-compatible local proxy for Cursor.
- Adds `Automagical Setup` to reuse a size-valid installed model when available,
  otherwise select a compatible default quantization, install/run it, verify the
  local endpoint, copy Cursor setup values, and open Cursor Models settings.
- Detects stale copied Cursor setup values after model stop/restart or dynamic
  port changes.
