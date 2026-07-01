# Changelog

## Unreleased

- Raises the install-time model memory budget from 72% to 80% of total RAM,
  pegged to the Apple Silicon Metal wired-memory limit, and trims the
  model-load estimate from 1.32x to 1.1x of file size (KV cache and server
  overhead are counted separately). A 64GB Mac now fits 70B-class 4-bit
  models.
- Free memory no longer blocks turning the model on. macOS reclaims cache and
  compresses idle apps on demand, so the old gate refused models that would
  run fine; it is now a non-blocking "memory is tight" warning, and a real
  llama-server startup failure reports a clear out-of-memory explanation.
- Adds a Run button to each fully downloaded model in the Storage list, so
  users can keep several models on disk and switch manually — for example a
  max-utilization model and a lighter one for when the Mac is busy.

## 0.0.1

- Initial public VSIX candidate.
- Adds `Local Motion: Open Setup` for macOS GGUF model setup.
- Profiles local machine memory and disk capacity.
- Searches Hugging Face GGUF repositories and ranks compatible quantizations.
- Downloads GGUF files with resumable streaming.
- Starts `llama-server` on `127.0.0.1` and registers the active model with the
  VS Code Language Model API.
- Provides an OpenAI-compatible local proxy for Cursor.
- Adds `Local Motion: Automagical Setup` and a setup-panel button to reuse a
  size-valid installed model when available, otherwise select a compatible
  default quantization, install/run it, verify the local endpoint, copy Cursor
  setup values, and open Cursor Models settings.
- Detects stale copied Cursor setup values after model stop/restart or dynamic
  port changes.
