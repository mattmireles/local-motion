---
name: chrome-extension-debug
description: >-
  Debug Local Motion as a VS Code/Cursor extension — Extension Development Host
  startup, command activation, setup webview behavior, VS Code Language Model
  API provider registration, local llama-server lifecycle, and Cursor
  OpenAI-compatible proxy setup. Use when extension runtime behavior fails and
  the problem is not a generic TypeScript compile error.
---

# VS Code Extension Debug

## Purpose

Debug Local Motion in the environment where it actually runs: VS Code or Cursor
Extension Development Host plus local macOS sidecar processes.

## First Reads

1. [`README.md`](../../../README.md).
2. [`README/Guides/vs-code-local-ai-hugging-face-guide.md`](../../../README/Guides/vs-code-local-ai-hugging-face-guide.md).
3. `local-motion` for subsystem invariants.

## Workflow

1. Reproduce in Extension Development Host when possible.
2. Identify the failing surface:
   - activation command or contribution in `package.json`
   - setup webview in `src/ui/setupPanel.ts`
   - controller/state path in `src/app/localMotionController.ts` or `src/state.ts`
   - model discovery/compatibility in `src/models/`
   - download/runtime/proxy path in `src/runtime/`
   - provider path in `src/provider/localMotionProvider.ts`
3. Run `npm run check` first for TypeScript failures.
4. Add `npm run lint` and `npm test` when source logic changed.
5. For runtime bugs, prove the fix with the smallest manual repro: command
   activation, setup flow, `llama-server` health, proxy response, or provider
   response.

## Anti-Patterns

- Debugging this as a browser extension. Local Motion is a VS Code/Cursor extension.
- Mutating Cursor private model-picker state. Show settings instead.
- Declaring runtime fixes without an Extension Development Host or equivalent
  proof path when behavior changed.

## Handoff Rules

- Use `local-motion` for architecture and subsystem invariants.
- Use `debug` for broader unclear investigations.
- Use `context7-mcp` for current VS Code API or llama.cpp documentation.
