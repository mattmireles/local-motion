# Local Motion

Local Motion is a VS Code and Cursor extension for installing and running GGUF coding models as local OpenAI-compatible models on macOS.

The intended path is:

1. Profile the Mac: architecture, unified memory, available memory, and model storage disk space.
2. Search Hugging Face GGUF repositories or paste a repo such as `yuxinlu1/gemma-4-12B-coder-fable5-composer2.5-v1-GGUF`.
3. Pick a quantization marked `Compatible` or `Not compatible` for this machine.
4. Download the model with resumable streaming.
5. Ensure `llama-server` is available, start it on a dynamic localhost port, and register the running model with the native VS Code Language Model API.
6. Start a tiny local OpenAI-compatible proxy that sanitizes Cursor request payloads before forwarding them to `llama-server`.
7. For Cursor, show the exact proxy base URL and model name. Cursor does not expose a stable extension API for changing its native model picker, so Local Motion gives precise settings instead of mutating Cursor's private state.

See [Local Native LLM Extensions for VS Code and Cursor on macOS](README/Guides/vs-code-local-ai-hugging-face-guide.md) for the full sidecar architecture field guide (VS Code LM API, GGUF downloads, `llama-server`, Cursor integration patterns, and debugging).

## Development

```bash
npm install
npm run compile
```

Open this folder in VS Code or Cursor, run the extension host, and execute `Local Motion: Open Setup`.

## Runtime

Local Motion prefers an existing `llama-server` binary from PATH, `/opt/homebrew/bin`, or `/usr/local/bin`. If it is not present and Homebrew is installed, the setup flow can install `llama.cpp` with:

```bash
brew install llama.cpp
```

Downloaded models are stored under the extension global storage directory, outside the workspace.
