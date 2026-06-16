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
  toward Models. If `llama-server` is missing and Homebrew is available,
  Automagical Setup installs `llama.cpp` as part of the same run.

## Requirements

- macOS.
- VS Code or Cursor compatible with VS Code `^1.105.0`.
- Homebrew, when `llama-server` is not already available on `PATH`,
  `/opt/homebrew/bin`, or `/usr/local/bin`; Automagical Setup uses it to install
  `llama.cpp`.
- Enough free disk and unified memory for the selected GGUF file.

## Setup

1. Install Local Motion.
2. Local Motion opens setup and runs `Automagical Setup` once on first startup.

The setup panel also exposes the same `Automagical Setup` action through
`Local Motion: Open Setup`.

First-start Automagical Setup may install `llama.cpp` through Homebrew and
download the default compatible GGUF model. Disable
`localMotion.runAutomagicalSetupOnFirstStartup` to make first startup open the
setup panel without starting the install.

If first-start setup fails or is cancelled, run
`Local Motion: Retry Automagical Setup`.

After Automagical Setup succeeds, Local Motion can restart the installed model
and prepare Cursor automatically on future editor startups without downloading a
new model. Disable `localMotion.resumeAutomagicalSetupOnStartup` to turn that
off.

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

## Publishing

Local Motion publishes to the Visual Studio Marketplace with `vsce`.

Local package proof:

```bash
npm run check
npm run lint
npm test
npm run package
```

Manual Marketplace publish:

```bash
VSCE_PAT=<token> npx vsce publish -p "$VSCE_PAT"
```

GitHub Actions publish:

1. Create or verify the Visual Studio Marketplace publisher ID from
   `package.json`.
2. Add a repository secret named `VSCE_PAT` with Marketplace `Manage` scope.
3. Run the `Publish VS Code Extension` workflow manually.

Microsoft recommends moving automated publishing to Entra ID before global Azure
DevOps Personal Access Tokens retire on December 1, 2026.

See [Local Native LLM Extensions for VS Code and Cursor on macOS](README/Guides/vs-code-local-ai-hugging-face-guide.md)
for the sidecar architecture field guide.
