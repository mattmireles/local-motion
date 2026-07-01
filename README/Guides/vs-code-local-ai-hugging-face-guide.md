# Local Native LLM Extensions for VS Code and Cursor on macOS

June 15, 2026

Field guide for building a macOS sidecar extension that downloads GGUF weights,
runs `llama-server`, registers models through the VS Code Language Model API, and
integrates with Cursor's OpenAI-compatible settings. Written for Local Motion and
similar extensions.

## Related Documentation

- **[Local Motion README](../../README.md)**: Product overview, dev setup, and the
  shippable runtime path for this repo.
- **[Cursor Model Picker Setup Plan](../Plans/001-cursor-model-picker-setup-plan.md)**:
  Local Motion's assisted Cursor setup plan; defines guardrails this repo follows
  (no private-state mutation, instruction-only Cursor integration).
- **[Cursor "Access to private networks is forbidden" Debugging Field Guide](cursor-private-network-block-guide.md)**:
  Why a localhost base URL can never work in Cursor (backend-routed BYOK, SSRF
  block) and the verified tunnel workarounds. Read before touching the Cursor
  handoff.
- **Implementation anchors in this repo**:
  - [`src/provider/localMotionProvider.ts`](../../src/provider/localMotionProvider.ts) —
    `vscode.lm` provider and `isUserSelectable` workaround.
  - [`src/runtime/downloader.ts`](../../src/runtime/downloader.ts) — resumable
    streaming GGUF downloads.
  - [`src/runtime/llamaServer.ts`](../../src/runtime/llamaServer.ts) — process
    lifecycle, health polling, OpenAI proxy.
  - [`src/cursor/cursorIntegration.ts`](../../src/cursor/cursorIntegration.ts) —
    instruction-only Cursor setup values.
  - [`src/runtime/openAiProxy.ts`](../../src/runtime/openAiProxy.ts) — payload
    sanitization for Cursor compatibility.

## Local Motion Guardrails (Read First)

This guide mixes **general field research** with patterns Local Motion **does**
and **does not** ship. When the text describes SQLite writes, quarantine stripping,
or automatic Cursor config mutation, treat that as background on what is possible
in the ecosystem—not as the Local Motion contract.

| Topic | General pattern in this guide | Local Motion today |
| --- | --- | --- |
| Cursor integration | Direct SQLite writes to `state.vscdb` | Instruction-only setup via [`cursorIntegration.ts`](../../src/cursor/cursorIntegration.ts); see [Plan 001](../Plans/001-cursor-model-picker-setup-plan.md) |
| `llama-server` acquisition | Download and strip quarantine from a binary | Prefer Homebrew or an existing PATH binary via `LlamaServerResolver` |
| Hugging Face access | `@huggingface/hub` npm helpers | Direct Hugging Face REST API in [`huggingFace.ts`](../../src/models/huggingFace.ts) plus streaming download in [`downloader.ts`](../../src/runtime/downloader.ts) |
| Local auth | Dummy OpenAI key | Bearer token `local-motion` enforced by the local proxy |

## Architectural Overview and the Sidecar Paradigm

The integration of local Large Language Models (LLMs) directly into the native user interfaces of Visual Studio Code and Cursor represents a profound architectural shift in developer tooling. Moving away from isolated chatbot windows and electron-based web views, the modern **sidecar** architecture allows developers to run robust, agentic coding assistants—capable of inline completions, deep codebase indexing, and autonomous tool execution—without transmitting sensitive intellectual property to remote cloud servers.

Building an extension that seamlessly orchestrates the downloading of open-source weights from the Hugging Face Hub, bypasses macOS security and quarantine restrictions, spawns a highly optimized local inference engine, and binds directly to the native `vscode.lm` API requires a highly orchestrated interplay of operating system primitives, Node.js stream management, and inter-process communication.

The architecture relies on three distinct subsystems:

1. **Hugging Face model acquisition layer** — safely streams massive GGUF binary files to the local macOS file system while providing native, non-blocking progress feedback to the editor interface.
2. **Process management layer** — safely executes the compiled `llama.cpp` server (`llama-server` binary) on macOS, programmatically circumventing Apple's Gatekeeper quarantine attributes to prevent execution blocking.
3. **API translation layer** — implements the Visual Studio Code Language Model Chat Provider interface to intercept native user queries, translate them into OpenAI-compatible payloads, manage the lifecycle of the request, and stream generated Server-Sent Events (SSE) tokens back to the native editor surface.

This field guide details implementation strategies, best practices, catastrophic edge cases, and deterministic debugging methodologies required to engineer this sidecar pattern successfully, with a specific focus on the idiosyncrasies of macOS and Apple Silicon hardware.

## Phase 1: Implementing the Visual Studio Code Language Model API Scaffold

The foundational mechanism for embedding a local model into the editor's native chat interfaces is the `vscode.lm.registerLanguageModelChatProvider` API. This extensibility point allows developers to contribute custom language models that appear seamlessly alongside cloud-based, first-party models like GPT-4o or Claude 3.5 Sonnet within the Copilot Chat model picker, unified chat view, and inline editor widgets.

### Extension Manifest Configuration

The extension must explicitly declare its capabilities within `package.json`. The extension contributes an array of provider definitions under `contributes.languageModelChatProviders`. This static declaration signals to the VS Code environment that the extension is capable of serving language model requests, prompting the editor host to query the extension for available models upon activation.

| Manifest property | Namespace | Purpose and implementation details |
| --- | --- | --- |
| `languageModelChatProviders` | `contributes` | Array of provider objects. Instructs the IDE that this extension provides LLM capabilities. |
| `vendor` | `languageModelChatProviders[x]` | Unique identifier string (e.g., `local-llama-sidecar`). Used internally by the editor to route requests. |
| `displayName` | `languageModelChatProviders[x]` | Human-readable name for the provider group (e.g., Local Open-Source Models). |
| `managementCommand` | `languageModelChatProviders[x]` | Optional command ID triggered when users click the gear icon to configure the models (e.g., downloading weights). |
| `activationEvents` | Root | Must include `onLanguageModelChatProvider:your-vendor-id` to ensure the extension activates lazily when the user interacts with the chat UI. |

During activation, invoke [`vscode.lm.registerLanguageModelChatProvider`](https://code.visualstudio.com/api/references/vscode-api#lm.registerLanguageModelChatProvider), passing the vendor identifier matching `package.json` and an instantiated TypeScript class that fully implements the [`LanguageModelChatProvider`](https://code.visualstudio.com/api/references/vscode-api#LanguageModelChatProvider) interface. The [Language Model Chat Provider guide](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider) documents the contribution point and registration flow. This interface mandates three asynchronous methods:

- `provideLanguageModelChatInformation`
- `provideLanguageModelChatResponse`
- `provideTokenCount`

### Dynamic Model Discovery and the Selection Interface

The `provideLanguageModelChatInformation` method discovers, instantiates, and publishes available local models to the editor. When invoked, the extension must return an array of `LanguageModelChatInformation` objects containing metadata such as the model identifier, human-readable name, context window limits (`maxInputTokens` and `maxOutputTokens`), and explicit capabilities regarding tool calling and image inputs.

**Critical discrepancy:** models registered via the API often function perfectly when accessed programmatically via `vscode.lm.selectChatModels()` and respond correctly to background agent requests, but completely fail to appear in the Copilot Chat model picker dropdown. Analysis indicates this occurs due to an undocumented, internal property required by the editor's UI layer to filter internal utility models from user-facing models.

**Fix for the missing model dropdown bug:** dynamically cast `LanguageModelChatInformation` objects (e.g., using `as any`) and inject `isUserSelectable: true`. Without this hidden flag, the editor assumes the model is a background engine intended only for invisible, programmatic tasks and deliberately obscures it from the graphical interface. This property is **not** documented in the official VS Code API reference as of June 2026; Local Motion sets it in [`localMotionProvider.ts`](../../src/provider/localMotionProvider.ts) based on observed picker behavior.

```typescript
const modelInfo = {
  id: 'local-llama-3-8b',
  name: 'Llama 3 8B (Local)',
  maxInputTokens: 8192,
  maxOutputTokens: 4096,
  capabilities: { toolCalling: true },
  // Undocumented but required for UI visibility:
  isUserSelectable: true,
} as any;
```

Populate `LanguageModelChatInformation` carefully to align with `llama-server` capabilities:

- `maxInputTokens` should match the `-c` (context window) argument passed to the server during initialization.
- If the model is instruction-tuned and capable of function execution, set `capabilities.toolCalling` to `true` so VS Code can send `LanguageModelToolCallPart` objects to the endpoint.

## Phase 2: Asset Acquisition and the Hugging Face Hub

Running a local inference engine is impossible without acquiring the neural network weights. For macOS architectures, particularly Apple Silicon (M1, M2, M3, M4), the **GGUF** (GPT-Generated Unified Format) binary format is strictly optimal. It encodes both quantized model tensors and standard metadata while allowing the inference engine to efficiently map the file directly into unified memory (using `mmap`) for rapid, zero-copy loading.

### Interfacing with the Hugging Face Ecosystem

The most robust npm mechanism for interfacing with the model repository is the [`@huggingface/hub`](https://www.npmjs.com/package/@huggingface/hub) package, which natively supports Node.js environments. Extensions can use it to query model repositories, fetch file metadata, traverse repository trees, and identify optimal quantization levels for the host machine's available unified memory. **Local Motion** instead calls the public [Hugging Face Hub HTTP API](https://huggingface.co/docs/hub/api) directly in [`huggingFace.ts`](../../src/models/huggingFace.ts) to avoid an extra dependency; either approach is valid if downloads stay streamed to disk.

**Warning:** while `@huggingface/hub` provides high-level utilities like `downloadFileToCacheDir`, developers frequently run into severe, application-crashing limitations when downloading multi-gigabyte GGUF files directly through these wrapper functions. The Node.js V8 engine imposes strict limits on heap memory allocation. Attempting to buffer a 4GB to 40GB GGUF file in memory before flushing it to disk will inevitably result in an `ERR_INVALID_OPT_VALUE` or a fatal Out Of Memory (OOM) crash, terminating the extension host entirely.

### Streaming Massive Binaries and Native UI Progress Indication

To circumvent memory limitations, the download process must rely on the native Node.js `fetch` API coupled with file streams to ensure data is piped directly to disk in small, manageable chunks. Initiate an HTTP GET request to the Hugging Face resolution URL and pipe the incoming `ReadableStream` response directly to the file system using `fs.createWriteStream`.

To reflect download progress within the editor, use the native `vscode.window.withProgress` API. Pass `location: vscode.ProgressLocation.Notification` alongside `cancellable: true` to display a persistent notification window equipped with a progress bar and a cancellation button.

Progress calculation:

1. Extract the `content-length` header from the initial fetch response.
2. Retrieve the stream reader via `response.body.getReader()`.
3. In an asynchronous `while (true)` loop, read `Uint8Array` chunks.
4. For each chunk, increment a running total, calculate the percentage against `content-length`, and call `progress.report({ increment: deltaPercentage, message: 'Downloading...' })`.
5. Simultaneously write each byte chunk to the file stream.

```typescript
await vscode.window.withProgress(
  { location: vscode.ProgressLocation.Notification, title: 'Downloading model', cancellable: true },
  async (progress, token) => {
    const response = await fetch(url, { signal: abortController.signal });
    const total = Number(response.headers.get('content-length') ?? 0);
    const reader = response.body!.getReader();
    const stream = fs.createWriteStream(destPath);

    let downloaded = 0;
    while (true) {
      if (token.isCancellationRequested) {
        abortController.abort();
        stream.destroy();
        fs.unlinkSync(destPath);
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.byteLength;
      stream.write(value);
      if (total > 0) {
        progress.report({ message: `${Math.round((downloaded / total) * 100)}%` });
      }
    }
    stream.end();
  },
);
```

### Network Resiliency and Interruption Recovery

**Cancellation handling:** when the `CancellationToken` from `withProgress` triggers, the extension must immediately destroy the file stream, abort the fetch request via an injected `AbortController`, and delete the partially downloaded binary from disk to prevent silent file corruption that will crash `llama-server` during the `mmap` phase.

**Retry logic:** HTTP requests to the Hugging Face Hub may encounter rate limits or temporary `502 Bad Gateway` responses. Implement exponential backoff retry for the initial stream establishment.

**Resume capability:** if the stream is interrupted mid-transfer after several gigabytes have been downloaded, discarding the file and starting over is highly punitive. Use HTTP Range headers to request remaining bytes starting from the current file size on disk:

```typescript
const existingSize = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
const headers = existingSize > 0 ? { Range: `bytes=${existingSize}-` } : {};
const response = await fetch(url, { headers });
// Append to file with flags: 'a' instead of 'w'
```

| Download methodology | Mechanism | Technical implications and stability |
| --- | --- | --- |
| High-level library buffer (`@huggingface/hub`) | Buffers the entire response into RAM before disk write. | **Catastrophic failure risk:** triggers V8 heap exhaustion for files over ~2GB. Unusable for LLMs. |
| Basic file stream (`fs.createWriteStream`) | Pipes fetch response body directly to a local file path. | **Stable:** avoids memory leaks. Lacks UI feedback, leaving the user unaware of progress. |
| Stream reader with `withProgress` integration | Iterates `Uint8Array` chunks, updating VS Code UI per chunk. | **Best practice:** seamless UI integration, granular cancellation control, stable memory footprint. |
| Stream reader with HTTP Range headers | Adds `Range: bytes=...` to resume partial transfers. | **Enterprise standard:** allows seamless recovery from network drops without wasting bandwidth. |

## Phase 3: macOS Gatekeeper and OS Security

> **Local Motion note:** this repo does **not** strip quarantine or `chmod` downloaded
> binaries. It resolves `llama-server` from PATH or Homebrew instead. Keep this
> section when you must ship a downloaded Mach-O binary inside an extension.

The most formidable operating system-level obstacle in executing a dynamically downloaded binary on macOS is the strict, multi-layered security architecture designed to prevent the execution of malicious software. When a binary file (such as the pre-compiled `llama-server` binary) is downloaded via Node.js file streams, `curl`, or a browser, macOS automatically tags the file with a quarantine extended attribute named `com.apple.quarantine`.

### The Quarantine Attribute Obstacle

Apple's Gatekeeper subsystem relies on this extended attribute to enforce signature verification and stringent notarization checks before allowing the kernel to execute the file. Because pre-compiled `llama-server` binaries distributed via GitHub releases, custom build pipelines, or dynamic downloaders are frequently un-notarized or self-signed, attempting to spawn the binary directly via Node.js `child_process` will result in an immediate `EACCES` error or a silently suppressed execution failure.

Users may also see blocking modal dialogs stating the application is "damaged and can't be opened" or "cannot be verified because it is from an unidentified developer," directing them to move the file to the Trash. This breaks the extension's automated, zero-touch workflow.

### Programmatic Stripping of Extended Attributes

Before spawning the process, manipulate the file system's extended attributes. Use `child_process.exec` to invoke the `xattr` utility:

```bash
xattr -d com.apple.quarantine <absolute_path_to_binary>
```

This strips the quarantine flag from the binary's metadata, allowing it to bypass the Gatekeeper verification prompt.

An alternative, more aggressive approach is `xattr -c <absolute_path_to_binary>`, which clears all extended attributes. While effective, `-d com.apple.quarantine` is the targeted best practice, as stripping all attributes can occasionally cause unintended side effects with file system indexing or AppleDouble resource forks.

### Ensuring Execution Permissions

Stripping the quarantine attribute solves Gatekeeper, but files downloaded via Node.js streams are written with standard read/write permissions, lacking the execute bit. Immediately after the `xattr` command, run:

```bash
chmod +x <absolute_path_to_binary>
```

Or use the Node.js API:

```typescript
fs.chmodSync(binaryPath, 0o755);
```

Failing to apply the execute bit results in a standard UNIX `EACCES` permission denied error when `child_process.spawn` is invoked.

| Execution obstacle | Root cause on macOS | Programmatic extension solution |
| --- | --- | --- |
| Gatekeeper execution block / "App is damaged" prompt | macOS flags web-downloaded binaries with `com.apple.quarantine`. | Strip the attribute using `xattr -d com.apple.quarantine <path>` prior to spawning. |
| Silent `EACCES` spawning error | `fs.createWriteStream` saves binaries without the UNIX execute (`+x`) permission bit. | Execute `chmod +x <path>` or `fs.chmodSync(path, 0o755)` after download completes. |
| Ambiguous bundle format rejection | Executing `.app` bundles instead of raw binaries triggers deeper `spctl` notarization checks. | Always extract and target the raw Mach-O binary executable directly (e.g., `llama-server`), avoiding macOS `.app` bundle wrappers. |

## Phase 4: Process Management and llama-server Orchestration

Once the binary is purged of quarantine restrictions and granted execution permissions, the extension must orchestrate its execution. The standard `llama.cpp` HTTP server (`llama-server`) is the optimal engine for this architecture due to its lightweight nature, robust hardware acceleration (Metal on Apple Silicon), and native compatibility with the OpenAI Chat Completions API.

### Constructing the Spawn Arguments

Use `child_process.spawn` to instantiate the server asynchronously. Essential arguments:

| Argument | Purpose |
| --- | --- |
| `-m <path>` | Absolute path to the downloaded GGUF file. |
| `--port <port>` | HTTP listening port. |
| `--host 127.0.0.1` | Bind to localhost, preventing external network access. |
| `-c <size>` | Context window size (e.g., 8192 or 32768). Larger context requires exponentially more RAM. |
| `-ngl 99` | On Apple Silicon, offloads all model layers to Metal for maximum GPU acceleration. |
| `--parallel <n>` | Number of server slots / concurrent requests (`-np` is a common alias in older examples). Default is `-1` (auto). |

```typescript
const server = spawn(binaryPath, [
  '-m', ggufPath,
  '--port', String(port),
  '--host', '127.0.0.1',
  '-c', '8192',
  '-ngl', '99',
  '--parallel', '2',
]);
```

### Dynamic Port Allocation and EADDRINUSE Prevention

**Anti-pattern:** hardcoding the listening port (e.g., statically assigning port 8080 or 11434). If multiple extension instances run across different VS Code workspace windows, or a previous server crashed and left a zombie process occupying the port, the spawn command will fatally crash with `EADDRINUSE`.

**Solution:** programmatically locate a guaranteed available port before spawning:

```typescript
import * as net from 'net';

function findFreePort(min = 50000, max = 65000): Promise<number> {
  return new Promise((resolve, reject) => {
    const tryPort = (port: number) => {
      const server = net.createServer();
      server.once('error', () => port < max ? tryPort(port + 1) : reject());
      server.once('listening', () => {
        server.close(() => resolve(port));
      });
      server.listen(port, '127.0.0.1');
    };
    tryPort(min);
  });
}
```

### Process Hierarchy and Zombie Eradication

VS Code extensions are frequently deactivated, updated, or reloaded. If the extension host terminates without explicitly killing the `llama-server` child process, the server becomes an orphaned zombie process that consumes massive amounts of unified memory and locks GPU resources indefinitely.

**Lifecycle rules:**

- Avoid setting `detached: true` unless absolutely necessary; detached processes escape the parent's process group and evade standard cleanup.
- Maintain a persistent reference to the child process object.
- In the extension's `deactivate` hook, issue `SIGTERM` to the child process.
- If the process `exit` event does not fire within three seconds of `SIGTERM`, escalate to `SIGKILL` to force kernel-level termination.

```typescript
export function deactivate() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }, 3000);
  }
}
```

## Phase 5: Interfacing with the Local Server and Stream Translation

Spawning `llama-server` is only half the battle; the extension must ascertain exactly when the server is genuinely ready to accept incoming inference requests. Loading a multi-gigabyte GGUF model into unified memory is a highly I/O-intensive operation that can take anywhere from three to thirty seconds depending on NVMe disk speed and model size.

### The Health Probe Dilemma and Startup Synchronization

During initialization, the HTTP server binds to the dynamic port immediately but cannot yet process completions. Attempting to forward a user's VS Code chat query during this window results in an immediate connection drop or a cryptic error payload.

**Solution:** poll the server's native `/health` endpoint (or `/v1/health`; both are public and unauthenticated per [llama.cpp server docs](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)):

```typescript
async function waitForHealthy(port: number, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
      // 503 with {"error":{"code":503,"message":"Loading model","type":"unavailable_error"}} — keep polling
    } catch {
      // ECONNREFUSED — port not yet bound; keep polling
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('llama-server failed to become healthy');
}
```

Only upon receiving HTTP `200 OK` should the extension signal to the VS Code UI that the model is ready and enable `vscode.lm` chat provider routing.

**Known bug:** under extreme inference load, the `/health` endpoint can time out because the HTTP server does not prioritize it on a dedicated fast-path thread. Health checks can be queued behind massive token generation tasks. Extensions that implement overly aggressive liveness probes during active generation may falsely interpret a delayed response as a server crash, inadvertently killing and restarting the process mid-generation. Use lenient timeouts—upwards of five seconds—for post-startup liveness probes.

### Payload Translation and the Streaming Event Loop

The extension acts as a reverse proxy between the native VS Code `LanguageModelChatProvider` and the local `llama-server`. The editor triggers `provideLanguageModelChatResponse`, passing an array of `LanguageModelChatRequestMessage` objects representing the conversation history.

Because `llama-server` natively implements `/v1/chat/completions` and expects payloads adhering to the OpenAI JSON schema, traverse the VS Code array and map native types into `{ role: string, content: string }` format.

Construct the JSON payload with `stream: true` and sensible generation parameters (`temperature`, `top_p`, `max_tokens`). Execute the outbound request via `fetch`.

When processing the incoming response stream, parse the `data: ` prefixed Server-Sent Events (SSE):

```typescript
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  const events = buffer.split('\n\n');
  buffer = events.pop() ?? '';

  for (const event of events) {
    if (!event.startsWith('data: ')) continue;
    const payload = event.slice(6);
    if (payload === '[DONE]') return;
    const json = JSON.parse(payload);
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) {
      progress.report(new vscode.LanguageModelTextPart(delta));
    }
  }
}
```

### Cancellation and Stream Termination

When the stream naturally concludes, the server emits a `data: [DONE]` signal. Trap this to cleanly resolve the async streaming function, allowing the VS Code UI to finalize the chat bubble and execute post-generation markdown rendering.

Monitor the `token: vscode.CancellationToken` injected by the editor. If the user clicks "Stop Generating" or closes the chat panel, `token.isCancellationRequested` becomes `true`. Immediately break the SSE reading loop and call `.abort()` on the fetch request's `AbortController`. If ignored, the VS Code UI stops updating, but `llama-server` continues computing the prompt to completion in the background, needlessly consuming CPU and GPU resources.

## Phase 6: Cursor Integration — Shippable vs Experimental Paths

While integrating with standard Visual Studio Code is accomplished entirely through the `vscode.lm` API, Cursor is a hard fork of VS Code that implements its own proprietary AI orchestration layers—most notably Composer and Agent interfaces—which bypass standard VS Code extensions. Standard VS Code Chat wrappers function within Cursor's basic chat panel, but lack the deep system permissions required to participate in Cursor's autonomous, multi-file agentic loops.

### Shippable path (Local Motion default)

Local Motion's supported Cursor path is **assisted, instruction-only setup**:

1. Start the local OpenAI-compatible proxy ([`openAiProxy.ts`](../../src/runtime/openAiProxy.ts)).
2. Copy Base URL, bearer token, and model ID from runtime status.
3. Have the user paste those values into **Cursor → Settings → Models**.

See [Plan 001](../Plans/001-cursor-model-picker-setup-plan.md) for the product contract: no mutation of Cursor private state until a stable public API exists.

### Experimental path: direct SQLite mutation (not shipped)

The research below describes how some extensions **attempt** to automate Cursor configuration by writing private state. Local Motion deliberately avoids this because the schema is unstable, the database is often locked, and writes can brick Cursor settings.

### Manipulating the SQLite Configuration State

Cursor does not rely exclusively on the standard VS Code `settings.json` for AI configuration. Highly sensitive API configurations, custom model declarations, base URL overrides, and authentication keys are persistently stored within a local SQLite database:

```text
~/Library/Application Support/Cursor/User/globalStorage/state.vscdb
```

When a user manually configures Cursor to point to a local inference engine, they navigate to **Settings → Models**, enable **Override OpenAI Base URL**, input the local server address (e.g., `http://127.0.0.1:<port>/v1`), and supply a dummy API key.

For an extension attempting to automate this configuration, manipulating the SQLite database programmatically is required. The `state.vscdb` uses a standard key-value schema within a table named `ItemTable`. The API key is stored under the key `cursorAuth/openAIKey`.

### Automating the Configuration Swap

Bundle a minimal SQLite client (like `better-sqlite3` compiled with static native bindings) to execute direct `UPDATE` or `INSERT` statements against `state.vscdb`. Before spawning `llama-server`, inject the dynamically generated localhost URL and dummy API key into the respective Cursor configuration keys.

**Operational risks:** the database is frequently locked by the active Cursor application process, meaning naive write attempts will throw SQLite `BUSY` or `LOCKED` exceptions. To safely write:

- Employ SQLite Write-Ahead Logging (WAL) modes.
- Implement retry logic with jitter.
- Or gracefully request the user to confirm a brief editor window reload immediately after the keys are updated.

| Configuration artifact | macOS file path | Extension manipulation strategy |
| --- | --- | --- |
| Settings overriding state | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` | Use a SQLite client to modify `cursorAuth/openAIKey` and inject base URLs. |
| Local AI memory / transcripts | `~/.cursor/chats/` and `workspaceStorage/*/state.vscdb` | Read-only access to parse previous conversations for enhanced context extraction. |
| Standard editor settings (macOS) | `~/Library/Application Support/Cursor/User/settings.json` | Modify `cursor.general.disableHttp2` if stream rendering fails. |

### Proxying Proprietary Payloads

Cursor's backend imposes strict verification protocols on model names. If the user overrides the base URL but leaves the active model set to `gpt-4o`, Cursor's proprietary routing logic may append custom prompt injections or reasoning tags incompatible with open-source models like Llama 3 or Qwen.

**Fix:** programmatically inject a custom model definition into Cursor's `customModels` JSON array within the SQLite state, forcing the UI to allow selection of the explicit local model name.

**Payload mutation bug:** when "Override OpenAI Base URL" is active, Cursor occasionally routes requests with top-level JSON keys formatted for its internal proprietary inference services rather than strictly adhering to the OpenAI specification. To mitigate payload rejection by the local `llama-server`, instantiate a transparent Node.js reverse proxy (operating on an intermediary port) that:

1. Intercepts Cursor's outbound HTTP requests.
2. Sanitizes the JSON body to conform to standard OpenAI specifications.
3. Strips proprietary tracking headers.
4. Forwards the cleaned payload to the actual `llama-server` process.

## Debugging Reference Manual: Edge Cases and Systemic Quirks

The intersection of local AI models, massive binary execution, and IDE extension hosts is inherently volatile. Engineers defensive mechanisms against hardware-specific and environment-specific bugs that manifest uniquely in this architecture.

### Rendering Failures and Network Diagnostics

**Symptom:** the internal client UI fails to render the streaming response despite the backend successfully generating tokens. The UI remains stuck on a loading spinner or displays blank chat bubbles, while extension debug logs indicate tokens are being received.

**Cause:** frequently tied to internal HTTP/2 multiplexing failures within the editor's Chromium-based network stack.

**Fix:** programmatically inject the setting into `settings.json`:

```json
{
  "cursor.general.disableHttp2": true
}
```

Extensions encountering persistent stream rendering issues should automatically prompt the user to apply this setting via `vscode.workspace.getConfiguration` and reload the window.

### Workspace Isolation and SQLite State Bloat

**Symptom:** catastrophic editor lag during simple disk read operations, frozen UI threads.

**Cause:** agentic tools that process massive amounts of tokens cause `state.vscdb` to bloat to sizes exceeding 10GB–12GB within a single day of heavy use. Local LLM interactions generate substantial local transcript histories and prompt checkpoints.

**Fix:** implement a background maintenance routine that:

- Uses the SQLite `VACUUM` command to defragment the database.
- Actively prunes orphaned chat transcripts that exceed a specific age threshold or token count limit.

### Tool Calling Formatting Discrepancies

**Symptom:** the server generates raw text rather than a structured JSON tool call when the extension forwards a `tools` array in the OpenAI payload.

**Cause:** different open-source models (Qwen vs. Llama vs. Mistral) expect vastly different system prompt formatting to understand tool definitions.

**Fix:** intercept requests that contain a `tools` array and dynamically rewrite the system prompt based on the specific GGUF model being loaded. By analyzing the model string, prepend the specific XML or JSON schema instructions that the model was instruction-tuned on, ensuring the local model outputs valid, parsable tool execution commands back to the VS Code API.

## Synthesis of Engineering Best Practices

Developing a sidecar extension that harnesses Hugging Face models natively within the macOS VS Code or Cursor environment requires mastering a multi-disciplinary stack. The naive approach of simply writing a REST API wrapper around an external tool is entirely insufficient for a production-grade developer experience.

A professional implementation must:

1. **Respect physical constraints** — stream massive GGUF weights directly to disk via unbuffered, chunk-based fetch streams to prevent Node.js V8 memory exhaustion.
2. **Navigate security perimeters** — either ship `llama-server` through a trusted install path (Homebrew or PATH, as Local Motion does) or strip `com.apple.quarantine` and set execute bits when you must run a downloaded Mach-O binary.
3. **Ensure system stability** — implement dynamic TCP port scanning to prevent `EADDRINUSE` conflicts, alongside stringent lifecycle management to trap termination signals and prevent orphaned, GPU-hogging zombie processes.
4. **Adapt to the environment** — integrate cleanly through `vscode.lm.registerLanguageModelChatProvider` for VS Code; for Cursor, prefer assisted OpenAI-base-URL setup and a sanitizing local proxy over private-state mutation.

By adhering to these architectural standards and defensive programming techniques, developers can deliver autonomous, local-first AI experiences that rival cloud-based solutions in responsiveness, while vastly exceeding them in privacy, security, and offline capability.

## Works Cited

1. [VS Code Language Model Chat Provider](https://code.visualstudio.com/api/extension-guides/ai/language-model-chat-provider) — official extension guide for `languageModelChatProviders` and `LanguageModelChatProvider`.
2. [VS Code Extension API: `vscode.lm`](https://code.visualstudio.com/api/references/vscode-api#lm) — `registerLanguageModelChatProvider` and related types.
3. [llama.cpp server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) — `/health`, `/v1/chat/completions`, and server flags including `--parallel`.
4. [@huggingface/hub on npm](https://www.npmjs.com/package/@huggingface/hub) — Node.js Hub client (optional; Local Motion uses the REST API directly).
5. [Hugging Face Hub API](https://huggingface.co/docs/hub/api) — model metadata and file resolution endpoints used by Local Motion search/download flows.
