---
name: local-motion
description: >-
  Work on Local Motion's VS Code/Cursor local-LLM extension — macOS machine
  profiling, Hugging Face GGUF discovery and downloads, llama-server
  discovery/lifecycle, VS Code Language Model API provider behavior, setup
  webview UX, and the local OpenAI-compatible proxy used by Cursor. Use before
  changing the extension hot path or debugging local model runtime behavior.
---

# Local Motion

## Purpose

Use this skill for Local Motion's actual product surface: a TypeScript VS Code
extension that helps a macOS user install, run, and connect local GGUF coding
models to VS Code and Cursor.

## First Reads

1. [`README.md`](../../../README.md) for the current product path.
2. [`README/Guides/vs-code-local-ai-hugging-face-guide.md`](../../../README/Guides/vs-code-local-ai-hugging-face-guide.md) for the sidecar architecture.
3. The smallest relevant source files:
   - `src/system/machineProfile.ts` for Mac resource detection.
   - `src/models/huggingFace.ts` and `src/models/compatibility.ts` for GGUF model discovery and fit checks.
   - `src/runtime/downloader.ts` for resumable downloads.
   - `src/runtime/llamaServerResolver.ts` and `src/runtime/llamaServer.ts` for `llama-server` discovery and process lifecycle.
   - `src/runtime/openAiProxy.ts`, `src/runtime/openAiChat.ts`, and `src/runtime/openAiStream.ts` for Cursor's OpenAI-compatible proxy path.
   - `src/provider/localMotionProvider.ts` for VS Code Language Model API registration.
   - `src/ui/setupPanel.ts` for setup UI behavior.

## Invariants

- Do **not** mutate Cursor private state or undocumented model-picker storage.
  Local Motion should show exact Cursor settings instead.
- Prefer an existing `llama-server` binary from PATH or Homebrew locations before
  asking the user to install anything.
- Downloads must stay resumable and observable. A local model installer that
  silently restarts huge GGUF downloads is broken.
- Keep subprocess and server lifecycle explicit: start, health check, stop, and
  surface errors in user-facing language.
- Keep the OpenAI proxy boring. Sanitize Cursor payloads, forward to
  `llama-server`, and preserve streaming behavior without inventing extra
  protocol layers.

## Verification

Run the narrowest gate that proves the change:

- `npm run check` for TypeScript changes.
- `npm run lint` for edited source files when style or imports changed.
- `npm test` for logic changes in model compatibility, downloads, proxy payloads,
  stream handling, or provider behavior.
- `npm run package` for release or manifest/package changes.

Manual proof usually means opening the Extension Development Host and running
`Local Motion: Open Setup`.

## Handoff Rules

- Use `debug` for unclear runtime failures after reading the guide.
- Use `audit` for broad review of extension architecture or sidecar lifecycle.
- Use `context7-mcp` when current VS Code, Hugging Face, or llama.cpp API docs
  materially affect the answer.
- Use `build-vs-buy` before adding dependencies for downloads, proxying,
  subprocess management, or UI convenience.
