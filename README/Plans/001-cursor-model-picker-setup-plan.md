# Cursor Model Picker Setup Plan

**Date:** 2026-06-16
**Status:** Planned

## Executive Summary

Make Local Motion satisfy the original product promise: after the user installs
and starts a compatible local model, `Prepare Cursor` should guide them through
adding that model to Cursor's native picker with minimal manual work. The plan
keeps the current safe boundary, does not mutate Cursor private state, and
turns the manual fallback into a polished assisted setup flow with verification.

## Problem Statement

- **Symptom:** Local Motion can install and run a local OpenAI-compatible model,
  but the user still has to read instructions and manually copy values into
  Cursor's Models settings.
- **Root Cause:** Cursor does not expose a stable extension API for adding a
  custom model or setting the OpenAI API key/base URL. The previous automatic
  state-write idea was removed because it was unsafe and unverified.
- **Impact:** The extension technically provides instructions, but it fails the
  intended experience bar: "click a button" and feel effortless inside Cursor.

## Mode Definitions

| Mode | Behavior | Why it matters |
| --- | --- | --- |
| Assisted Setup | One primary click verifies the local endpoint, copies the full setup block, opens Cursor settings filtered to Models when supported, and renders field-by-field copy controls. | This is the shippable default because it uses public Cursor UI behavior only. |
| Manual Fallback | Local Motion shows all values and instructions when clipboard/settings commands fail. | Users are never blocked by Cursor UI or clipboard limits. |

## Goals and Non-Goals

### Goals

- [ ] Make `Prepare Cursor` one primary action after a model is running.
- [ ] Make the primary `Prepare Cursor` click verify the local endpoint, copy a
  full setup block, and open Cursor settings filtered to Models when supported.
- [ ] Add recovery copy buttons for Base URL, API key, and model ID, with
  visible confirmation and error states.
- [ ] Add one-click copy buttons for Base URL, API key, model ID, and a full
  setup block.
- [ ] Detect when the running Local Motion endpoint changes and mark existing
  Cursor setup values stale.
- [ ] Add a verification action that calls the local proxy model-list endpoint
  with the required bearer token and confirms the model ID is reachable before
  prompting the user to configure Cursor.
- [ ] Keep the Cursor integration instruction-only unless a future verified
  Cursor API or schema contract exists.

### Non-Goals

- Mutating `state.vscdb`, secure storage, `settings.json`, or any Cursor private
  application state.
- Automating mouse/keyboard input into Cursor settings with AppleScript or UI
  scripting.
- Making Cursor Agent, Composer, Inline Edit, or Tab autocomplete route through
  the local endpoint when Cursor itself does not honor custom OpenAI base URLs
  for those surfaces.
- Adding native dependencies such as `better-sqlite3` for Cursor state writes.

## Scope and Constraints

- **Scope:** `src/ui/setupPanel.ts`, `src/app/localMotionController.ts`,
  `src/cursor/cursorIntegration.ts`, `src/runtime/openAiProxy.ts`,
  `src/state.ts`, `tests/pure-logic.test.mjs`, `README.md`, and package
  metadata if commands or tests change.
- **Architecture reference:** [Local Native LLM Extensions for VS Code and Cursor on macOS](../Guides/vs-code-local-ai-hugging-face-guide.md) — sidecar patterns, VS Code LM API, GGUF download, and Cursor integration research (with Local Motion guardrails called out).
- **Constraints:** Cursor 3.7.36 reports VS Code `1.105.1` on this machine, so
  the extension must remain installable with `engines.vscode: ^1.105.0`.
- **Guardrails:** Do not write Cursor private state. Do not lower the safety
  posture established by the audit-fix-loop. Do not make the endpoint public;
  it must stay bound to `127.0.0.1`.

## Ground Truth Contracts (Do Not Violate)

- **Cursor setup is GUI-owned:** Local Motion may open settings and copy values,
  but Cursor owns API key/base URL/model storage until a stable public contract
  exists.
- **Local endpoint identity:** Cursor values must come from the active
  `RuntimeStatus`, not persisted installed-model state.
- **Proxy auth:** Cursor must use `local-motion` as the local bearer token
  because the proxy rejects unauthenticated local requests.
- **Cursor proxy port:** The `llama-server` upstream may use a dynamic port, but
  Cursor should see the stable preferred proxy URL from `localMotion.proxyPort`
  whenever that port is available. If the preferred proxy port is occupied,
  Local Motion falls back to an ephemeral port and marks copied setup stale.
- **VSIX compatibility:** Packaging must keep Cursor `1.105.1` install support.
- **Endpoint verification:** Local Motion readiness means the local proxy answers
  `GET ${baseUrl}/models` with `Authorization: Bearer local-motion`, HTTP 200,
  and `data[].id` containing the active `RuntimeStatus.modelId`. Cursor picker
  readiness is only proven by manual Cursor QA after the values are entered.

## Already Shipped (Do Not Re-Solve)

- **Model install/runtime:** `src/app/localMotionController.ts`,
  `src/runtime/downloader.ts`, `src/runtime/llamaServer.ts`, and
  `src/runtime/llamaServerResolver.ts` install, validate, and run GGUF models.
- **Cursor manual instructions:** `src/cursor/cursorIntegration.ts` generates
  Base URL, API key, and model ID setup steps.
- **OpenAI-compatible proxy:** `src/runtime/openAiProxy.ts` exposes
  `/v1/models` and `/v1/chat/completions` on localhost.
- **Safety fixes:** Current code avoids Cursor private-state mutation, avoids
  `chmod`/`xattr` quarantine bypass, pins Hugging Face downloads by revision,
  and size-validates model reuse.

## Fresh Baseline (Current State)

- **Architecture:** `SetupPanel` owns webview rendering and message routing;
  `LocalMotionController` owns model/search/install/runtime orchestration;
  `cursorIntegration` is a pure instruction generator.
- **Current UX gap:** `Prepare Cursor` renders instructions, but does not copy
  values, sequence the setup, verify the endpoint, or keep Cursor's Base URL
  stable across restarts.
- **Current tests:** `npm test` covers quantization parsing, parameter parsing,
  chat request sanitization, bearer auth, and Cursor instruction generation.
- **Current package:** `local-motion-0.0.1.vsix` installs into Cursor after the
  `^1.105.0` compatibility fix.

## Solution Overview

Keep the system brutally simple: do not build a fragile Cursor config mutator.
Make the safe path excellent.

```text
Running Local Motion model
  -> RuntimeStatus(baseUrl, modelId)
  -> CursorSetupViewModel
  -> Prepare Cursor action
     -> verify local endpoint
     -> copy full setup block
     -> open Settings filtered to Cursor Models when supported
     -> render checklist + stale-port warning
```

## Build vs Buy Decision

Capability: Reduce manual Cursor model setup friction without unsafe private
state mutation.

Candidates:

- `better-sqlite3` / SQLite mutation - rejected. Cursor API keys are not
  reliably scriptable through ordinary config/SQLite, and private state writes
  were already audited as unsafe.
- AppleScript/UI automation - rejected. It is brittle across Cursor versions,
  requires accessibility permissions, and creates a worse operational surface
  than manual copy controls.
- Native VS Code `vscode.env.clipboard` and settings command - selected. These
  are already available, require no dependency, and keep Cursor state changes in
  Cursor's UI.

Decision:

- Build from scratch with VS Code extension primitives already in use.

Why:

- The primitive workflow is only copy/open/verify/render.
- No new runtime dependency is needed.
- It preserves the audited safety boundary.
- It fails gracefully when Cursor changes its UI.

Dependency cost note:

- Add no dependency. The cost of a SQLite or UI-automation dependency is higher
  than the manual steps it hides, and the failure mode is user settings damage.

## Implementation Phases

> Do one phase at a time. Verify before proceeding.

### Phase 0: Baseline and Cursor Contract

**Goal:** Freeze the current Cursor behavior and extension compatibility before
changing UX.

**Tasks:**

- [x] Run `cursor --version` and record the Cursor/VS Code version in this plan
  or the PR description.
- [x] Run `npm run check`, `npm run lint`, `npm test`, and `npm run package`.
- [x] Confirm `cursor --install-extension local-motion-0.0.1.vsix` still works.
- [x] Add a short README note that Cursor custom OpenAI base URL support is
  global and may not apply to Agent/Composer surfaces.

**Verification:** Commands pass, VSIX installs into Cursor, and the README
truthfully distinguishes Local Motion setup from Cursor feature coverage.

**Phase 0 evidence:**

- `cursor --version`: `3.7.36`, commit
  `776d1f9d76df50a4e0aeca61819a88e7c1b861e0`, `arm64`.
- `npm run check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 11 tests.
- `npm run package`: passed after tightening `.vscodeignore` so the VSIX ships
  runtime artifacts instead of repo agent config, plans, scripts, and temp
  files.
- `cursor --install-extension /Users/mm/Documents/GitHub/local-motion/local-motion-0.0.1.vsix`:
  passed.
- Phase audit: `scripts/run-cross-agent-phase-audit.sh` produced usable Codex
  findings but the wrapper did not finish cleanly and the Claude artifact was
  empty, so the external reviewer path is recorded as partially failed; the
  findings were fixed in this plan update.

---

### Phase 1: Cursor Setup View Model

**Goal:** Make Cursor setup data explicit and testable.

**Tasks:**

- [x] Replace raw instruction arrays in `src/cursor/cursorIntegration.ts` with a
  typed `CursorSetupViewModel`:
  - `baseUrl`
  - `apiKey`
  - `modelId`
  - `isRunning`
  - `setupBlock`
  - `steps`
  - `statusMessage`
- [x] Generate the view model only from `RuntimeStatus`.
- [x] Update `src/app/localMotionController.ts` to send
  `cursorSetupViewModel` instead of unstructured instructions.
- [x] Extend `tests/pure-logic.test.mjs` for running and stopped states.

**Verification:** `npm test` proves model ID, Base URL, API key, setup block,
and stopped-state guidance are generated from runtime state only. Stale endpoint
tests wait until Phase 3, where stale state exists.

**Phase 1 evidence:**

- `npm run check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 12 tests.
- Phase audit: local `phase-audit` fallback used because the cross-agent helper
  hung during Phase 0; no P0/P1 findings. Cosmetic `cursorInstructions` DOM
  naming remains until the Phase 2 checklist replaces that block.

---

### Phase 2: Assisted Setup Actions

**Goal:** Turn `Prepare Cursor` into a guided action instead of passive text.

**Tasks:**

- [x] Add controller actions in `src/app/localMotionController.ts`:
  - `prepareCursor`
  - `copyCursorValue(key)` for Base URL, API key, model ID, and full setup block
  - `verifyCursorEndpoint`
- [x] Use `vscode.env.clipboard.writeText` for copy actions.
- [x] Use `vscode.commands.executeCommand("workbench.action.openSettings",
  "Cursor Models")` to open Settings filtered toward Cursor Models when the
  host supports it. Do not claim this is an exact deep link unless Phase 0
  proves one.
- [x] Define webview message commands and response payloads in
  `src/ui/setupPanel.ts`:
  - request `{ command: "prepareCursor" }` -> response
    `{ type: "cursorSetupPrepared", viewModel, verification }`
  - request `{ command: "copyCursorValue", key: "apiKey" | "baseUrl" | "modelId" | "setupBlock" }`
    -> response `{ type: "cursorCopyResult", key, ok, message }`
  - request `{ command: "verifyCursorEndpoint" }` -> response
    `{ type: "cursorEndpointVerification", ok, message }`
  - request `{ command: "openCursorSettings" }` -> response
    `{ type: "cursorSettingsOpened", ok, message }`
- [x] Define the primary click behavior for `Prepare Cursor`:
  1. verify the local endpoint;
  2. copy the full setup block to the clipboard;
  3. open Settings filtered to Cursor Models when supported;
  4. render the checklist with field-by-field copy controls.
- [x] In `src/ui/setupPanel.ts`, replace the current passive instruction block
  with a compact checklist:
  - Verify local endpoint
  - Copy API key
  - Copy Base URL
  - Copy Model ID
  - Open Cursor Models settings
  - Add custom model in Cursor
  - Select model in Cursor picker
- [x] Keep visible one-click copy buttons after the primary action runs.
- [x] Use this exact Cursor field mapping in UI copy:
  - OpenAI API Key: `local-motion`
  - Override OpenAI Base URL: active Local Motion `baseUrl`
  - Custom Model / Model Name: active Local Motion `modelId`

**Verification:** Manual extension-host run shows the primary click verifies the
endpoint, copies the full setup block, opens settings or reports why it could
not, and leaves copy controls visible. Cursor setup is not called complete until
manual QA confirms the model appears in Cursor's native picker.

**Phase 2 evidence:**

- `npm run check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 12 tests.
- Phase audit: local fallback used. No Cursor private-state writes, no UI
  scripting, no new dependency, and `prepareCursor` does not copy/open when
  endpoint verification fails.
- Manual Extension Development Host proof is deferred to Phase 4 because it
  requires a running GGUF model and real Cursor picker interaction.

---

### Phase 3: Stale Endpoint Detection

**Goal:** Prevent users from leaving Cursor pointed at a dead dynamic port.

**Tasks:**

- [x] Persist the last copied Cursor setup values in Local Motion global state:
  `localMotion.lastCopiedCursorSetup`.
- [x] Use this storage shape:

  ```typescript
  interface LastCopiedCursorSetup {
    baseUrl: string;
    modelId: string;
    apiKeyLabel: "local-motion";
    copiedAt: string;
    trigger: "prepareCursor" | "copySetupBlock";
    endpointVerifiedAt?: string;
  }
  ```

- [x] Update this state only when `prepareCursor` succeeds or when the user
  explicitly copies the full setup block. Do not update it for copying a single
  field.
- [x] Compare last copied Base URL/model ID with current `RuntimeStatus`.
- [x] Show a clear stale warning when the model is stopped or the Base URL
  changes.
- [x] Add a `Copy Updated Setup` action that copies the full replacement block.
- [x] Clear or mark stale state when `localMotion.stop` runs.

**Verification:** Unit tests cover same endpoint, changed endpoint, stopped
model, state transition on `prepareCursor`, state transition on
`copySetupBlock`, and no state transition on single-field copies. Manual run
confirms a stop/start cycle produces a stale warning.

**Phase 3 evidence:**

- `npm run check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 28 tests.
- Phase audit: local fallback used. The stale-state path persists only
  `localMotion.lastCopiedCursorSetup`, compares it with active runtime status,
  distinguishes copied values from verified endpoint setup, and marks stopped or
  changed dynamic-port setup values stale.
- Manual stop/start UI proof is deferred to Phase 4 with the rest of real Cursor
  picker QA.

---

### Phase 4: Validation and Cleanup

**Goal:** Prove the assisted setup flow and keep packaging clean.

**Tasks:**

- [x] Run `npm run check`.
- [x] Run `npm run lint`.
- [x] Run `npm test`.
- [x] Run `npm audit --audit-level=moderate`.
- [x] Run `npm run package`.
- [x] Install the VSIX with `cursor --install-extension`.
- [ ] Manual QA in Cursor:
  - start default model or a small test GGUF
  - verify endpoint
  - copy setup values
  - open Models settings
  - add custom model
  - select it in Cursor model picker
  - send one `Cmd+L` chat request

**Verification:** All commands pass, VSIX installs, and manual QA proves Cursor
can select the Local Motion model through the native model picker.

**Phase 4 evidence:**

- `npm run check`: passed.
- `npm run lint`: passed.
- `npm test`: passed, 34 tests.
- `npm audit --audit-level=moderate`: passed, 0 vulnerabilities.
- `npm run package`: passed, compiling from `src/**` through
  `vscode:prepublish` before `vsce package` and producing
  `/Users/mm/Documents/GitHub/local-motion/local-motion-0.0.1.vsix`.
- `cursor --install-extension /Users/mm/Documents/GitHub/local-motion/local-motion-0.0.1.vsix`:
  passed.
- Hardcore audit fix loop: fixed endpoint verification timeout, transient
  webview action state resets, runtime copy-key validation, copied-vs-verified
  setup wording, and package compile-before-VSIX reproducibility.
- Public extension readiness: packaged README now explains setup, requirements,
  Cursor limitations, and privacy; manifest metadata points to the public origin
  repository and issue tracker. `CHANGELOG.md`, `SUPPORT.md`, and a Marketplace
  gallery banner are included for the public listing. A manual
  `Publish VS Code Extension` GitHub Actions workflow is checked in and excluded
  from the VSIX.
- Automagical setup: setup UI now exposes one primary `Automagical Setup` action
  that reuses a size-valid installed model file when available; otherwise it
  selects the lowest-memory compatible default quantization, installs/runs it,
  then prepares Cursor. The selector and installed-model reuse predicate are
  covered by regression tests.
- Dependency setup: when `allowInstall` is true and `llama-server` is missing,
  Local Motion now installs `llama.cpp` through Homebrew under progress without
  a second confirmation prompt. The user's explicit `Automagical Setup` or
  `Install and Run` action is the confirmation. Guarded by regression test
  `automagical dependency install has no second confirmation prompt`.
- Command-palette setup: `Local Motion: Automagical Setup` now runs the same
  path directly, so the user no longer has to open the setup panel first.
- Retry setup: `Local Motion: Retry Automagical Setup` is a command-palette
  alias for the same automagical path, so users can recover explicitly after a
  cancelled or failed first-start install/download. Guarded by regression test
  `retry automagical setup command is registered and contributed`.
- First-run onboarding: the extension activates on `onStartupFinished` and opens
  the setup panel once when no model is installed, so a new user does not have to
  discover a command before seeing the automagical path. This is guarded by
  regression test
  `opens setup onboarding only for first startup without an installed model`.
- First-start automagical setup: by default, the first startup with no installed
  model opens the setup panel and starts `Automagical Setup` once. This may
  install `llama.cpp` and download the default compatible GGUF model. The attempt
  is marked before it starts so failures do not silently retry on every editor
  launch, and users can disable it with
  `localMotion.runAutomagicalSetupOnFirstStartup`. Guarded by regression test
  `runs first startup automagical setup only once before any model is installed`.
- Host-started error surfacing: automagical setup started by activation or the
  command palette now reports failures into the setup webview instead of leaving
  the panel stuck on the started state. Guarded by regression test
  `host-started automagical setup reports errors to the webview`.
- Startup resume: after a successful Automagical Setup, future startups can
  restart the size-valid installed model without another click. This path is
  reuse-only and does not select or download a replacement model when the stored
  GGUF is missing or invalid. Guarded by regression test
  `resumes automagical setup only after a completed setup with an installed
  model`. Startup resume also does not install a missing `llama-server`
  dependency; explicit Automagical Setup and manual Install and Run are the only
  paths allowed to invoke Homebrew dependency installation. Guarded by
  regression test `startup resume does not install missing llama dependency`.
  Startup resume runs through the controller's runtime-only path instead of
  copying setup values, opening Cursor settings, replacing the clipboard, or
  opening the setup panel. Recovery opens setup only if resume fails or the
  Cursor setup becomes stale and the user chooses that action. Guarded by
  regression test
  `startup resume does not prepare Cursor or open the setup panel unless recovery is requested`.
- Stable Cursor proxy: Local Motion now prefers
  `http://127.0.0.1:41434/v1` for the Cursor-facing OpenAI proxy so Cursor's
  Base URL can survive editor restarts even when the upstream `llama-server`
  port changes. If that preferred port is occupied, the proxy falls back to an
  ephemeral port and existing stale-setup warnings still apply. Guarded by
  regression tests
  `OpenAI proxy uses the preferred Cursor port when it is available` and
  `OpenAI proxy falls back to a dynamic port when the preferred Cursor port is occupied`.
- Completion state: `localMotion.automagicalSetupCompleted` is written only
  when endpoint verification, setup-block copy, and Cursor settings opening all
  succeed. Guarded by regression test
  `automagical setup completion requires endpoint, clipboard, and settings
  success`.
- Command-palette setup progress: the command now runs through
  `SetupPanel.runAutomagicalSetup`, so the command-palette path and setup-panel
  button share one progress/completion pipeline instead of running the controller
  directly with no webview progress updates.
  The panel waits for its webview `ready` handshake before posting automagical
  setup progress, with a short fallback so the command cannot hang if the webview
  never replies.
  Not testable: command-palette webview progress requires a live VS Code/Cursor
  extension host; guarded here by `npm run check` and VSIX install proof.
- Architecture hardening: controller/webview setup payloads now use
  `src/setupProtocol.ts` discriminated TypeScript types instead of loose
  `Record<string, unknown>` responses, and automagical setup shares the
  controller's internal `installAndStart` primitive instead of calling the
  manual `installRun` command handler. Host-started automagical setup now posts
  base webview state before reporting setup progress, skips default
  quantization loading while setup is active, and keeps late quantization
  responses from re-enabling manual install. Guarded by regression test
  `host-started automagical setup hydrates base state before progress`.
- Marketplace publish: Not executed. No `VSCE_PAT` or Open VSX token is present
  in this environment, and the Marketplace publisher ID `local-motion` still
  needs authenticated ownership confirmation before `vsce publish`. The GitHub
  workflow expects a `VSCE_PAT` repository secret with Marketplace `Manage`
  scope. Live GitHub check: PR #1 is open and mergeable, no workflow is listed
  on `main` yet, and `gh secret list --repo mattmireles/local-motion` returned
  no visible secrets.
- Manual Cursor model-picker QA: Not testable in this non-interactive run. The
  machine has `llama-server` at `/Users/mm/.local/bin/llama-server`, but no
  existing Local Motion GGUF storage was found and Cursor CLI does not expose a
  non-interactive model-picker QA path.

## Follow-Up: Read-Only Automatic Setup Research

This is deliberately outside the implementation critical path. If Cursor later
exposes a stable custom-model API, create a separate plan before adding writes.

- Add a read-only diagnostic command only if needed:
  `Local Motion: Diagnose Cursor Setup`.
- Allowed checks: Cursor version, application path existence, and documented
  public API/contract availability.
- Forbidden checks: opening SQLite databases, reading secure storage, reading
  Cursor state file contents, copying secrets, writing JSON settings, or writing
  any Cursor application support file.
- Required proof for future writes: official Cursor API documentation or a
  version-pinned public contract, plus rollback and backup design.

## Executable Memory

- Regression test: `npm run check && npm run lint && npm test && npm run package`
- Install proof: `cursor --install-extension /Users/mm/Documents/GitHub/local-motion/local-motion-0.0.1.vsix`
- Manual proof: Cursor `Cmd+L` can select the Local Motion model after assisted
  setup and reach the local proxy.

## Success Criteria

### Hard Requirements (Must Pass)

- [x] No Cursor private-state writes exist in source.
- [x] `Prepare Cursor` provides one-click copy controls for API key, Base URL,
  model ID, and full setup block.
- [x] `Prepare Cursor` opens Cursor Models settings.
- [x] Local endpoint verification succeeds before opening/copying assisted
  setup values; Cursor picker readiness is verified only by manual Cursor QA.
- [x] Cursor proxy uses a stable preferred port when available, and stale
  endpoint state remains visible when Local Motion must fall back to a different
  port.
- [x] VSIX remains installable in Cursor's VS Code `1.105.1` environment.
- [x] `Automagical Setup` owns the default Local Motion path: reuse an installed
  model when possible; otherwise select compatible quantization, install/run
  model, verify endpoint, copy Cursor setup, and open Cursor Models settings.
- [x] Command palette exposes `Local Motion: Automagical Setup` as the shortest
  default setup path.

### Definition of Done

- [x] All tests passing.
- [x] VSIX packaged and installed locally.
- [x] README updated with truthful Cursor feature coverage.
- [ ] Manual Cursor model-picker QA completed.
- [x] No new dependency added unless a later phase explicitly justifies it.

## Open Questions

### Resolved

- **Q:** Should Local Motion write Cursor SQLite/settings/secure storage?
- **A:** No. Current evidence says API key/base URL are not safely scriptable,
  and the previous private-state path was removed after audit.

- **Q:** Should Local Motion use a UI automation dependency?
- **A:** No. It would require accessibility permissions and would be more
  brittle than copy/open/checklist primitives.

### Unresolved

- **Q:** Does Cursor expose any stable API for custom model insertion in a newer
  version than this machine's Cursor 3.7.36 / VS Code 1.105.1?
- **Options:** keep assisted setup, run separate read-only research, or plan a
  version-gated automatic setup once a public contract exists. Current lean:
  assisted setup only for this plan.

- **Q:** Which Cursor surfaces honor the OpenAI-compatible override for local
  models on the user's current Cursor build?
- **Options:** only `Cmd+L` chat/plan, broader model picker, or surface-specific
  behavior. Current lean: document and test `Cmd+L` first; do not promise
  Agent/Composer until verified.

## References

### Internal

- [Local Motion README](../../README.md)
- `src/cursor/cursorIntegration.ts`
- `src/app/localMotionController.ts`
- `src/ui/setupPanel.ts`
- `src/runtime/openAiProxy.ts`
- `tests/pure-logic.test.mjs`

### External

- [LLM Gateway Cursor integration](https://docs.llmgateway.io/guides/cursor)
- [SambaNova Cursor integration guide](https://docs.sambanova.ai/docs/en/integrations/cursor)
- [Cursor forum: API key and override base URL values](https://forum.cursor.com/t/openai-api-and-override-base-url-values/148140)
- [Cursor forum: custom base URL is global](https://forum.cursor.com/t/can-the-api-key-and-base-url-corresponding-to-a-custom-model-be-set-separately-when-adding-a-cursor/137108)

## User Flow

1. User runs `Local Motion: Open Setup`.
2. User installs and runs a compatible model.
3. User clicks `Prepare Cursor`.
4. Local Motion verifies the local endpoint.
5. Local Motion copies the full setup block and opens Settings filtered toward
   Cursor Models when supported.
6. User pastes API key, Base URL, and model ID into Cursor:
   - OpenAI API Key: `local-motion`
   - Override OpenAI Base URL: active Local Motion Base URL
   - Custom Model / Model Name: active Local Motion Model ID
7. User selects the model in Cursor's native model picker.
8. Local Motion keeps individual copy buttons visible for recovery.
9. If Local Motion restarts on a new port, the setup panel marks the Cursor
   setup stale and offers updated copy actions.

## Error Handling and Edge Cases

| Scenario | Behavior | Fallback |
| --- | --- | --- |
| Local model is not running | Disable setup actions and show start-model prompt. | User starts model first. |
| Clipboard write fails | Show error and keep selectable text visible. | User manually selects/copies values. |
| Settings command opens wrong page | Say Settings was opened with a filter, not an exact deep link. | User navigates to Cursor Settings -> Models manually. |
| Endpoint verification fails | Do not open/copy assisted setup as ready. | Restart model or inspect Local Motion output. |
| Endpoint returns wrong model ID | Show mismatch and block assisted-ready state. | Restart the intended model. |
| Endpoint returns 401 | Show API key mismatch and use `local-motion` as the required key. | Copy API key again. |
| Cursor override breaks other providers | Warn that OpenAI Base URL override is global. | User disables override when switching back to cloud providers. |
| Cursor Agent/Composer ignores override | Document surface limitation. | Use Cursor chat/plan mode or a separate local-agent tool. |

## Degradation and Rollback

**Degradation Modes:**

- **If assisted setup actions fail:** Local Motion falls back to visible manual
  instructions and copyable values.
- **If endpoint verification fails:** Local Motion keeps the model setup panel
  usable and reports the proxy error.

**Rollback Plan:**

- **How to revert:** `git revert <commit>` for implementation changes.
- **Time to rollback:** under five minutes.
- **Data recovery needed:** No. This plan must not write Cursor private state.

## Files Likely to Change

| File | Change Type | Notes |
| --- | --- | --- |
| `src/cursor/cursorIntegration.ts` | Modify | Replace raw instructions with typed setup view model. |
| `src/app/localMotionController.ts` | Modify | Add copy, verify, and stale-state actions. |
| `src/ui/setupPanel.ts` | Modify | Add checklist UI and copy controls. |
| `src/state.ts` | Modify | Persist last copied Cursor setup values. |
| `src/runtime/openAiProxy.ts` | Modify | No expected change unless verification needs a small helper endpoint; `/v1/models` already exists. |
| `tests/pure-logic.test.mjs` | Modify | Add setup view model and stale-state tests. |
| `README.md` | Modify | Document assisted setup and Cursor surface limits. |

## Risks and Mitigations

- **Cursor UI changes:** The settings page may move -> keep copy controls and
  manual instructions independent of settings navigation.
- **Overpromising automatic setup:** Users expect zero manual work -> label the
  feature "assisted setup" unless a verified automatic path exists.
- **Dynamic port confusion:** Cursor can retain a dead URL -> persist last
  prepared setup and warn when stale.
- **Global OpenAI override side effects:** Other Cursor models can break -> warn
  before setup and document how to disable the override.

## Progress Tracker

- [x] Phase 0 complete
- [x] Phase 1 complete
- [x] Phase 2 complete
- [x] Phase 3 complete
- [ ] Phase 4 complete
