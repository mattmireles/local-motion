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
- **Dynamic port:** Any stopped/restarted Local Motion model may receive a new
  Base URL and invalidate Cursor's saved override.
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
  values, sequence the setup, verify the endpoint, or warn clearly about stale
  dynamic ports.
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

- [ ] Run `cursor --version` and record the Cursor/VS Code version in this plan
  or the PR description.
- [ ] Run `npm run check`, `npm run lint`, `npm test`, and `npm run package`.
- [ ] Confirm `cursor --install-extension local-motion-0.0.1.vsix` still works.
- [ ] Add a short README note that Cursor custom OpenAI base URL support is
  global and may not apply to Agent/Composer surfaces.

**Verification:** Commands pass, VSIX installs into Cursor, and the README
truthfully distinguishes Local Motion setup from Cursor feature coverage.

---

### Phase 1: Cursor Setup View Model

**Goal:** Make Cursor setup data explicit and testable.

**Tasks:**

- [ ] Replace raw instruction arrays in `src/cursor/cursorIntegration.ts` with a
  typed `CursorSetupViewModel`:
  - `baseUrl`
  - `apiKey`
  - `modelId`
  - `isRunning`
  - `setupBlock`
  - `steps`
  - `statusMessage`
- [ ] Generate the view model only from `RuntimeStatus`.
- [ ] Update `src/app/localMotionController.ts` to send
  `cursorSetupViewModel` instead of unstructured instructions.
- [ ] Extend `tests/pure-logic.test.mjs` for running and stopped states.

**Verification:** `npm test` proves model ID, Base URL, API key, setup block,
and stopped-state guidance are generated from runtime state only. Stale endpoint
tests wait until Phase 3, where stale state exists.

---

### Phase 2: Assisted Setup Actions

**Goal:** Turn `Prepare Cursor` into a guided action instead of passive text.

**Tasks:**

- [ ] Add controller actions in `src/app/localMotionController.ts`:
  - `prepareCursor`
  - `copyCursorBaseUrl`
  - `copyCursorApiKey`
  - `copyCursorModelId`
  - `copyCursorSetupBlock`
  - `verifyCursorEndpoint`
- [ ] Use `vscode.env.clipboard.writeText` for copy actions.
- [ ] Use `vscode.commands.executeCommand("workbench.action.openSettings",
  "Cursor Models")` to open Settings filtered toward Cursor Models when the
  host supports it. Do not claim this is an exact deep link unless Phase 0
  proves one.
- [ ] Define webview message commands and response payloads in
  `src/ui/setupPanel.ts`:
  - request `{ command: "prepareCursor" }` -> response
    `{ type: "cursorSetupPrepared", viewModel, verification }`
  - request `{ command: "copyCursorValue", key: "apiKey" | "baseUrl" | "modelId" | "setupBlock" }`
    -> response `{ type: "cursorCopyResult", key, ok, message }`
  - request `{ command: "verifyCursorEndpoint" }` -> response
    `{ type: "cursorEndpointVerification", ok, message }`
  - request `{ command: "openCursorSettings" }` -> response
    `{ type: "cursorSettingsOpened", ok, message }`
- [ ] Define the primary click behavior for `Prepare Cursor`:
  1. verify the local endpoint;
  2. copy the full setup block to the clipboard;
  3. open Settings filtered to Cursor Models when supported;
  4. render the checklist with field-by-field copy controls.
- [ ] In `src/ui/setupPanel.ts`, replace the current passive instruction block
  with a compact checklist:
  - Verify local endpoint
  - Copy API key
  - Copy Base URL
  - Copy Model ID
  - Open Cursor Models settings
  - Add custom model in Cursor
  - Select model in Cursor picker
- [ ] Keep visible one-click copy buttons after the primary action runs.
- [ ] Use this exact Cursor field mapping in UI copy:
  - OpenAI API Key: `local-motion`
  - Override OpenAI Base URL: active Local Motion `baseUrl`
  - Custom Model / Model Name: active Local Motion `modelId`

**Verification:** Manual extension-host run shows the primary click verifies the
endpoint, copies the full setup block, opens settings or reports why it could
not, and leaves copy controls visible. Cursor setup is not called complete until
manual QA confirms the model appears in Cursor's native picker.

---

### Phase 3: Stale Endpoint Detection

**Goal:** Prevent users from leaving Cursor pointed at a dead dynamic port.

**Tasks:**

- [ ] Persist the last prepared Cursor setup in Local Motion global state:
  `localMotion.lastPreparedCursorSetup`.
- [ ] Use this storage shape:

  ```typescript
  interface LastPreparedCursorSetup {
    baseUrl: string;
    modelId: string;
    apiKeyLabel: "local-motion";
    preparedAt: string;
    trigger: "prepareCursor" | "copySetupBlock";
    endpointVerifiedAt?: string;
  }
  ```

- [ ] Update this state only when `prepareCursor` succeeds or when the user
  explicitly copies the full setup block. Do not update it for copying a single
  field.
- [ ] Compare last prepared Base URL/model ID with current `RuntimeStatus`.
- [ ] Show a clear stale warning when the model is stopped or the Base URL
  changes.
- [ ] Add a `Copy Updated Setup` action that copies the full replacement block.
- [ ] Clear or mark stale state when `localMotion.stop` runs.

**Verification:** Unit tests cover same endpoint, changed endpoint, stopped
model, state transition on `prepareCursor`, state transition on
`copySetupBlock`, and no state transition on single-field copies. Manual run
confirms a stop/start cycle produces a stale warning.

---

### Phase 4: Validation and Cleanup

**Goal:** Prove the assisted setup flow and keep packaging clean.

**Tasks:**

- [ ] Run `npm run check`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm audit --audit-level=moderate`.
- [ ] Run `npm run package`.
- [ ] Install the VSIX with `cursor --install-extension`.
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

- [ ] No Cursor private-state writes exist in source.
- [ ] `Prepare Cursor` provides one-click copy controls for API key, Base URL,
  model ID, and full setup block.
- [ ] `Prepare Cursor` opens Cursor Models settings.
- [ ] Local endpoint verification succeeds before opening/copying assisted
  setup values; Cursor picker readiness is verified only by manual Cursor QA.
- [ ] Stale dynamic-port state is visible after stop/restart.
- [ ] VSIX remains installable in Cursor's VS Code `1.105.1` environment.

### Definition of Done

- [ ] All tests passing.
- [ ] VSIX packaged and installed locally.
- [ ] README updated with truthful Cursor feature coverage.
- [ ] Manual Cursor model-picker QA completed.
- [ ] No new dependency added unless a later phase explicitly justifies it.

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
| `src/state.ts` | Modify | Persist last prepared Cursor setup. |
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

- [ ] Phase 0 complete
- [ ] Phase 1 complete
- [ ] Phase 2 complete
- [ ] Phase 3 complete
- [ ] Phase 4 complete
