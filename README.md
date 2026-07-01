# Local Motion

Local Motion turns a local coding agent on and off for VS Code and Cursor. It
chooses a compatible local model for your Mac, loads it when you need it, and
frees the memory when you do not.

## What It Does

- Gives you one local-agent switch: turn on, connect Cursor, free memory.
- Chooses a compatible local coding model for this Mac.
- Reuses the installed model when possible, so turning it on again is quick.
- Keeps every downloaded model on disk and switches between them on demand,
  so you can run a maximum-size model normally and a lighter one when the
  Mac is busy.
- Connects Cursor through an opt-in tunnel without writing Cursor private state.
- Frees the loaded model from memory immediately when you are done.
- Keeps the runtime bound to `127.0.0.1`.

## Under The Hood

- Profiles your Mac for architecture, memory, and model storage space.
- Sizes the model memory budget at 80% of unified memory, pegged to the Apple
  Silicon Metal wired-memory limit (the real ceiling for GPU-resident GGUF
  weights), and estimates load cost at 1.1x file size plus explicit KV-cache
  and server overheads.
- Never blocks a start on current free memory. macOS reclaims cache and
  compresses idle apps on demand, so Local Motion shows a non-blocking
  "memory is tight" warning instead of refusing, and reports an honest
  out-of-memory explanation if `llama-server` genuinely cannot load.
- Searches Hugging Face GGUF repositories and ranks compatible quantizations
  only when setup or advanced model controls need them.
- Downloads model files with resumable streaming.
- Finds or installs `llama-server` through Homebrew.
- Starts `llama-server`, a stable loopback OpenAI-compatible proxy, and an
  opt-in Cursor tunnel when enabled.
- Registers the running model with the VS Code Language Model API, with the
  provider's manage action opening the local-agent switch.

## Requirements

- macOS.
- VS Code or Cursor compatible with VS Code `^1.105.0`.
- Homebrew, when `llama-server` is not already available on `PATH`,
  `/opt/homebrew/bin`, or `/usr/local/bin`; Local Motion uses it to install
  `llama.cpp`.
- Enough free disk and unified memory for the selected GGUF file.
- Localhost port `41434` available for the Cursor-facing proxy, or set
  `localMotion.proxyPort` to another port. If the preferred port is occupied,
  Local Motion falls back to an ephemeral port and shows updated setup values.
- `cloudflared` when using the managed Cursor tunnel, or set
  `localMotion.cursorTunnelUrl` to a public HTTPS tunnel URL you manage.

## Setup

1. Install Local Motion.
2. Local Motion opens the local-agent switch once on first startup.
3. Click `Turn On Local Agent`.

The setup panel also exposes advanced model controls, but the default path does
not require choosing a repository, model size, or quantization.

When a local model is already running, `Local Motion: Connect Cursor to Local Agent` runs the
Cursor handoff directly from the command palette. If a size-valid installed model
is stopped, the command starts it first; then it verifies the endpoint, copies
the setup block, and opens Cursor Models settings.

`Turn On Local Agent` may install `llama.cpp` through Homebrew and download the
best compatible GGUF quantization for this Mac. Local Motion ships a
biggest-first coder ladder and picks the most capable model that fits at 4-bit
or better: a 30B mixture-of-experts coder (Qwen3-Coder-30B-A3B) on capable Macs,
falling through to smaller Qwen coders on machines with less unified memory.
Override the first choice with
`localMotion.defaultModelRepo`. Set `localMotion.runAutomagicalSetupOnFirstStartup`
to `true` only if you want that install/download to start automatically on first
startup.

The ladder is maintained from a live ranking; see
[README/Notes/model-selection.md](README/Notes/model-selection.md) and
`npm run models:check` / `npm run models:refresh`.

If setup fails or is cancelled, run `Local Motion: Repair Local Agent`.

Run `Local Motion: Free Memory` to unload the local model immediately.

### Switching Models

Every downloaded model stays on disk. To switch, open the setup panel, click
`Manage` next to the storage line, and click `Run` on any fully downloaded
model. The current model stops, the selected one starts, and it becomes the
model that `Turn On Local Agent` starts next time. A practical pattern on a
loaded Mac: keep one maximum-size model for focused work and one small model
for when other applications need the memory.

Run `Local Motion: Diagnose Setup` for a read-only status check of the installed
model file, local runtime, proxy verification, copied Cursor values, and the
remaining Cursor picker verification step.

After the local agent is connected once, Local Motion can restart the installed
model automatically on future editor startups without downloading a new model,
opening the setup panel, opening Cursor settings, or replacing the clipboard.
Cursor tunnel URLs can rotate across model restarts, so the setup panel marks
previously copied Cursor values stale when the active Base URL changes. Disable
`localMotion.resumeAutomagicalSetupOnStartup` to turn automatic local model
restart off.

For advanced manual control:

1. Load a Hugging Face GGUF repository.
2. Pick a quantization marked `Compatible`.
3. Click `Install and Turn On`; Local Motion starts the model, verifies the Cursor
   endpoint, copies the setup block, and opens Cursor Models settings.

`Connect Cursor to Local Agent` verifies `GET /v1/models` through the
Cursor-facing tunnel with the current session key, copies the full setup block,
opens Cursor Settings (in plain VS Code, the filtered settings editor instead),
and leaves one-click copy controls visible for:

- OpenAI API Key: the current session key
- Override OpenAI Base URL: the active public Cursor tunnel Base URL
- Add Custom Model: the active Local Motion model ID
- Full setup block

## Cursor Coverage

Cursor does not expose a stable extension API for mutating its native model
picker or private settings. Local Motion deliberately does not write Cursor
SQLite databases, secure storage, `settings.json`, or other private application
state.

**Known Cursor limit (confirmed 2026-07-01):** Cursor routes every custom-model
request through its own cloud backend, which refuses private addresses with
`Provider returned error: Access to private networks is forbidden`. A
`http://127.0.0.1:41434/v1` Base URL therefore cannot work in Cursor's native
chat, in any build. The proven workaround is a public HTTPS tunnel
(cloudflared or ngrok) in front of the Local Motion proxy — with the tradeoff
that prompts then transit Cursor's backend and the tunnel, so the Cursor path
is "local compute", not "fully private". Anyone with the tunnel URL and current
session key can reach the proxy while the tunnel is up, and Cursor's Zero Data
Retention does not apply to custom keys. Full failure analysis, fix matrix, and
setup steps:
[Cursor private-network block guide](README/Guides/cursor-private-network-block-guide.md).
The fully local path (`vscode.lm` provider) works in real VS Code only; Cursor
does not implement the VS Code Language Model API.

Cursor's OpenAI Base URL override is global in Cursor settings and may not apply
to every Cursor surface. Custom API keys officially power chat models only —
Tab autocomplete, Apply, and Auto never use the custom endpoint, and Agent mode
is best-effort. Treat setup as proven only for the Cursor surface you manually
test, such as `Cmd+L` chat. Do not assume Agent, Composer, Inline Edit, or Tab
autocomplete use the tunnel until verified in your Cursor build.

Local Motion keeps Cursor's Base URL stable across restarts by preferring
`http://127.0.0.1:41434/v1` for the local proxy. If that port is occupied and
Local Motion falls back to a different port, the setup panel marks previously
copied Cursor values stale and offers `Copy Updated Setup`.

## Privacy

Local Motion binds its runtime services to `127.0.0.1`. Model files are stored in
the extension global storage directory, outside the workspace. VS Code
Language Model API requests stay on loopback. Cursor requests use local compute
but transit Cursor's backend and the configured tunnel before reaching the
Local Motion proxy. Requests sent to the proxy are sanitized before forwarding
to `llama-server`.

## Development

```bash
npm install
npm run check
npm run lint
npm test
npm run package
```

The `CI` GitHub Actions workflow runs the same deterministic gate on pull
requests and pushes: install, typecheck, lint, test, and package.

Optional local runtime smoke proof:

```bash
npm run smoke:local-runtime
```

This downloads the default compatible GGUF when it is not already cached, starts
`llama-server`, verifies the Cursor-facing proxy, and sends one local chat
completion.

Open this folder in VS Code or Cursor, run the Extension Development Host, and
execute `Local Motion: Open Local Agent`.

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
