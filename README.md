# Local Motion

Local Motion installs and runs GGUF coding models locally on macOS, then exposes
them to VS Code and Cursor through local OpenAI-compatible endpoints.

## What It Does

- Profiles your Mac for architecture, memory, and model storage space.
- Searches Hugging Face GGUF repositories and ranks compatible quantizations.
- Downloads model files with resumable streaming.
- Finds or installs `llama-server` through Homebrew.
- Starts `llama-server` on `127.0.0.1` with a dynamic port.
- Registers the running model with the VS Code Language Model API.
- Starts a local OpenAI-compatible proxy for Cursor.
- Offers `Automagical Setup`: reuses an installed model when available, otherwise
  selects a compatible default quantization, installs it, starts it, verifies the
  local endpoint, copies the Cursor setup block, and opens Settings filtered
  toward Models.

## Requirements

- macOS.
- VS Code or Cursor compatible with VS Code `^1.105.0`.
- Homebrew, when `llama-server` is not already available on `PATH`,
  `/opt/homebrew/bin`, or `/usr/local/bin`.
- Enough free disk and unified memory for the selected GGUF file.

## Setup

1. Install Local Motion.
2. Run `Local Motion: Open Setup`.
3. Click `Automagical Setup`.

For manual control:

1. Load a Hugging Face GGUF repository.
2. Pick a quantization marked `Compatible`.
3. Click `Install and Run`.
4. For Cursor, click `Prepare Cursor`.

`Prepare Cursor` verifies `GET /v1/models` on the local proxy with
`Authorization: Bearer local-motion`, copies the full setup block, opens Cursor
settings filtered toward Models, and leaves one-click copy controls visible for:

- OpenAI API Key: `local-motion`
- Override OpenAI Base URL: the active Local Motion Base URL
- Custom Model / Model Name: the active Local Motion model ID
- Full setup block

## Cursor Coverage

Cursor does not expose a stable extension API for mutating its native model
picker or private settings. Local Motion deliberately does not write Cursor
SQLite databases, secure storage, `settings.json`, or other private application
state.

Cursor's OpenAI Base URL override is global in Cursor settings and may not apply
to every Cursor surface. Treat setup as proven only for the Cursor surface you
manually test, such as `Cmd+L` chat. Do not assume Agent, Composer, Inline Edit,
or Tab autocomplete use the local endpoint until verified in your Cursor build.

If the Local Motion model stops or restarts on a new dynamic port, the setup
panel marks previously copied Cursor values stale and offers `Copy Updated
Setup`.

## Privacy

Local Motion binds its runtime services to `127.0.0.1`. Model files are stored in
the extension global storage directory, outside the workspace. Cursor requests
sent to the Local Motion proxy are sanitized before forwarding to
`llama-server`.

## Development

```bash
npm install
npm run check
npm run lint
npm test
npm run package
```

Open this folder in VS Code or Cursor, run the Extension Development Host, and
execute `Local Motion: Open Setup`.

See [Local Native LLM Extensions for VS Code and Cursor on macOS](README/Guides/vs-code-local-ai-hugging-face-guide.md)
for the sidecar architecture field guide.
