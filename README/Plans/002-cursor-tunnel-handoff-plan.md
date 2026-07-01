# Honest Cursor Tunnel Handoff Plan

**Date:** 2026-07-01
**Status:** In-Progress

## Executive Summary

Cursor routes every custom-model (BYOK) request through its cloud backend,
which rejects private base URLs with "Access to private networks is
forbidden." Our current handoff — copying `http://127.0.0.1:41434/v1` into
Cursor Settings — can therefore never work. This plan replaces it with an
opt-in managed cloudflared Quick Tunnel: Local Motion spawns `cloudflared`,
parses the public `https://*.trycloudflare.com` URL, hands that URL to Cursor,
protects the now-public proxy with a per-session random bearer key, and says
the privacy tradeoff out loud ("local compute, Cursor-routed prompts"). The
VS Code `vscode.lm` path stays fully local and unchanged.

## Problem Statement

- **Symptom:** Assisted Cursor setup verifies green, then the first real chat
  fails with `Provider returned error: Access to private networks is
  forbidden`.
- **Root Cause:** Cursor's backend originates the HTTP call to the Override
  OpenAI Base URL; loopback/RFC-1918 addresses are unreachable by definition
  and blocked by a server-side SSRF filter. Confirmed vendor architecture, not
  a bug — Cursor's own docs: "all requests are routed through Cursor's servers
  for final prompt building"
  ([cursor.com/help/models-and-usage/api-keys](https://cursor.com/help/models-and-usage/api-keys)).
  Full evidence in the
  [Cursor private-network block field guide](../Guides/cursor-private-network-block-guide.md)
  (now checked into this branch).
- **Impact:** The flagship Cursor handoff is a guaranteed dead end today, and
  the setup UI implies a privacy claim ("local") that the Cursor path cannot
  deliver. Shipping nothing is dishonest; shipping copy-a-tunnel-URL-manually
  is a per-session chore with no staleness detection.

## Goals and Non-Goals

### Goals

- [ ] A working, opt-in Cursor handoff: user enables tunnel → Local Motion
  produces a public HTTPS base URL that Cursor's backend can reach.
- [ ] Strong per-session random bearer key enforced on the proxy whenever it
  is tunnel-exposed (and, for simplicity, always).
- [ ] Honest copy everywhere the Cursor path is described: "local compute,
  Cursor-routed prompts." The word combination "fully private" never appears
  on the Cursor path.
- [ ] Tunnel URL rotation on restart is caught by the existing
  `cursorSetupFreshness` staleness mechanism with zero new machinery.
- [ ] Graceful degradation when `cloudflared` is not installed: show the
  one-line `brew install cloudflared` step instead of failing.

### Non-Goals

- Bundling or auto-installing the `cloudflared` binary (license, size, and
  trust footguns; a one-line brew install is acceptable friction for opt-in).
- Named tunnels, ngrok, Tailscale Funnel, or VPS paths — documented in the
  field guide for power users, not managed by the extension.
- Making the tunnel default-on. Prompts transiting Cursor's backend and a
  tunnel is a privacy decision the user must take explicitly.
- Changing the `vscode.lm` provider path in any way. It stays loopback-only
  and fully local.
- Working around Cursor's Agent-mode payload quirks or the Verify button's
  false positives (vendor-side; guide §3 documents them).

## Scope and Constraints

- **Scope:** proxy auth key, new tunnel runtime module, controller wiring,
  `cursorSetupViewModel` base-URL selection, setup webview opt-in UI and copy,
  docs.
- **Constraints:** `cloudflared` Quick Tunnels are officially a
  testing/development feature: no account needed, but the hostname rotates
  every restart, there is no SLA, and SSE is officially unsupported (guide
  §5.1). Whether streaming actually works against this proxy is settled by a
  mandatory spike in Phase 2, not assumed. The feature ships framed as an
  **experimental opt-in bridge**, and that framing appears in the setting
  description and webview copy. Cursor sends only the `Authorization: Bearer`
  header; no other auth layer is possible in front of the tunnel (guide §5.2).
- **Guardrails:** proxy keeps binding `127.0.0.1` only — the tunnel is the
  sole public path, and killing `cloudflared` instantly severs public access
  (this is the kill switch). Bearer auth must reject before any upstream work.

## Ground Truth Contracts (Do Not Violate)

- **No Cursor private-state writes:** unchanged from
  [Plan 001](001-cursor-model-picker-setup-plan.md); a tunnel does not change
  the instruction-only contract with Cursor settings.
- **Proxy binds loopback only:** `openAiProxy.ts` continues to listen on
  `127.0.0.1`. Public exposure exists only while the user's opt-in tunnel
  process is alive.
- **Bearer auth is mandatory on every proxy route, including `/health`:**
  today `OpenAiProxy.handle` forwards `GET /health` before auth
  (`src/runtime/openAiProxy.ts:99`); with a public URL that leaks upstream
  liveness. Move auth in front of every route. The key must be random per
  session, not guessable, not the static `local-motion`.
- **The session key never appears in logs, diagnostics, persisted state, or
  notes:** it is a real credential once tunneled. Redact it from error
  messages (today `verifyViewModelEndpoint` embeds `viewModel.apiKey` in a
  message that reaches the output channel — `src/cursor/cursorSetupWorkflow.ts:170`,
  `src/extension.ts:132`). Full-key display is limited to the intentional
  copy UI and the clipboard.
- **Tunnel lifecycle lives next to the proxy:** `LlamaServerManager`
  (`src/runtime/llamaServer.ts`) owns the `OpenAiProxy` and stops it
  autonomously on llama-server crash (`llamaServer.ts:111-119`) and on
  `deactivate()`. The tunnel child must be a sibling field there so every
  proxy-stop path — including crash — kills it. Controller-level ownership
  would orphan a public tunnel on crash.
- **Copy honesty:** Cursor-path copy is "local compute, Cursor-routed
  prompts". "Fully local"/"fully private" is reserved for the VS Code
  `vscode.lm` path.
- **`clientObserved` stays the only proof of use:** endpoint verification and
  copy actions still do not set it (`src/types.ts` doc comment).

## Already Shipped (Do Not Re-Solve)

- **Staleness mechanism:** `cursorSetupFreshness` in
  `src/cursor/cursorIntegration.ts` already flags `stale` whenever the current
  `baseUrl` differs from the last-copied one. A rotated tunnel URL is just a
  changed `baseUrl`; no new rotation handling is needed.
- **Endpoint verification:** `CursorSetupWorkflow.verifyViewModelEndpoint`
  already fetches `${baseUrl}/models` with the bearer key — pointed at the
  tunnel URL it becomes a true end-to-end reachability check through the same
  path Cursor uses (modulo Cursor's egress), unlike Cursor's own Verify button.
- **Setup webview plumbing:** copy buttons, `resetCursorActionStateIfEndpointChanged`,
  and the prepare-Cursor workflow all key off `cursorSetupViewModel(status)`.

## Fresh Baseline (Current State)

- `src/runtime/openAiChat.ts` exports `LOCAL_MOTION_API_KEY = "local-motion"`
  (static; comment explicitly says "not a secret" because loopback-only —
  that assumption dies the moment a tunnel exists).
- `src/runtime/openAiProxy.ts` (261 LOC) binds `127.0.0.1`, enforces the
  static bearer, reports `http://127.0.0.1:<port>/v1`.
- `src/cursor/cursorIntegration.ts` (171 LOC) builds the view model straight
  from `RuntimeStatus.baseUrl` (the loopback URL) and hardcodes the
  `"local-motion"` `apiKeyLabel` literal in `LastCopiedCursorSetup`.
- `src/ui/setupPanelHtml.ts` copy says "Runs a coding model on this Mac for
  Cursor" / "Cursor is using your local model" with no transit disclosure.
- Known gap: no tunnel anything; the Cursor handoff is broken end to end.

## Solution Overview

```
llama-server ← openAiProxy (127.0.0.1:41434, random bearer)
                    ↑                       ↑
        vscode.lm provider          cloudflared quick tunnel (opt-in child process)
        (fully local, unchanged)            ↑
                              https://<words>.trycloudflare.com/v1
                                            ↑
                              Cursor backend (prompt building) ← Cursor app
```

One new runtime module owns the `cloudflared` child process;
`LlamaServerManager` holds it as a sibling of the proxy so every stop path
kills it. `RuntimeStatus` grows an explicit `cursorTunnel` state.
`cursorSetupViewModel` prefers the tunnel URL over the loopback `baseUrl`
when present, and states the reachability problem when
absent. Everything downstream (copy, verify, staleness, webview) follows the
view model and needs only copy changes.

### Decision: managed tunnel vs docs-only

Docs-only was seriously considered (SIMPLER IS BETTER) and rejected:

- Quick Tunnel URLs rotate **every** cloudflared restart. Docs-only means the
  user re-runs a terminal command, re-copies a URL, and re-pastes into Cursor
  every session, with no way for Local Motion to know the values it displays
  are dead. That guarantees the exact silent-stale failure the freshness
  mechanism was built to prevent.
- Managed mode reuses the freshness mechanism for free and keeps the one-click
  `prepareCursor` flow honest (it verifies the *tunnel* URL).
- The cost is one small child-process module (~150 LOC) with the same
  spawn/lifecycle shape as the existing `llamaServer.ts`. We do not take on
  accounts, config files, or binary distribution — `cloudflared` missing
  degrades to a single copyable install command.

## Build vs Buy and Dependency Cost

- **Capability checked:** public HTTPS ingress to a loopback port.
- **Candidates considered:** cloudflared Quick Tunnel (managed child
  process), ngrok (needs account + authtoken, 1 GB/20k-req free caps),
  localtunnel npm (interstitial page breaks Cursor — guide §6), bundling a
  tunnel SDK.
- **Decision:** wrap the system `cloudflared` binary; no npm dependency.
- **Why:** zero-signup, staff-endorsed by Cursor for exactly this use, and
  child-process management is already an established pattern in this repo.
- **Dependency cost note:** no new package.json dependency. Runtime dependency
  on user-installed `cloudflared` (Homebrew), explicit and opt-in.

## Implementation Phases

> Do one phase at a time. Verify before proceeding.

### Phase 1: Per-session random bearer key

**Goal:** Kill the static `local-motion` key before anything becomes public.

**Skills:** `local-motion`, `documentation`

**Tasks:**

- [x] `src/runtime/openAiChat.ts`: replace the exported constant with
  `generateApiKey(): string` (32+ hex chars via `crypto.randomBytes`) and make
  `isAuthorizedBearer(header, key)` take the expected key. Update the header
  comment: the key is now a real credential because the proxy may be
  tunnel-exposed.
- [x] `src/runtime/openAiProxy.ts` / `openAiStream.ts`: generate the key at
  proxy construction, thread it through internal upstream calls, expose it on
  the proxy/session so `RuntimeStatus` can carry it. Move bearer auth ahead of
  the `/health` forward (currently unauthenticated at `openAiProxy.ts:99`).
- [x] `src/runtime/llamaServer.ts`: surface the proxy's session key in
  `RuntimeSession`/status (this file owns the proxy — see contracts).
- [x] `src/provider/localMotionProvider.ts`: adapt to the parameterized
  `openAiStream` call (vscode.lm behavior unchanged; key passed in-process).
- [x] `src/types.ts`: add `apiKey?: string` to `RuntimeStatus` (present iff
  running); change `apiKeyLabel` on **both** `LastCopiedCursorSetup` and
  `AutomagicalSetupCompletion` from the `"local-motion"` literal to a
  non-secret label such as `"session-key"` (never persist the key itself).
- [x] `src/stateValidation.ts`: update **both** validators
  (`isLastCopiedCursorSetup`, `isAutomagicalSetupCompletion`) — accept the new
  label and legacy `"local-motion"` records (widen, don't reject old state).
- [x] `src/cursor/cursorIntegration.ts` + `cursorSetupWorkflow.ts`: read the
  key from `RuntimeStatus`; **remove the key from the HTTP-error message** in
  `verifyViewModelEndpoint` (secret-redaction contract).
- [x] `src/app/localMotionController.ts`: plumb the key into `RuntimeStatus`.
- [x] `scripts/smoke-local-runtime.mjs`: stop importing the deleted constant;
  read the session key from the runtime it drives.
- [x] `tests/pure-logic.test.mjs`: rewrite the ~15 assertions that reference
  `LOCAL_MOTION_API_KEY` or hardcode `apiKeyLabel: "local-motion"` (bearer
  auth, view model, freshness, automagical completion).

**Verification:** `npm run check && npm test && npm run smoke:local-runtime`
(if runnable locally); new unit tests: key is ≥32 chars, differs across
sessions, `isAuthorizedBearer` rejects `local-motion` and accepts the session
key; `/health` without bearer returns 401; legacy persisted records with
`apiKeyLabel: "local-motion"` still validate; no error-message string contains
the session key.

**Phase 1 status:** Complete on 2026-07-01. Verification run:
`npm run check`, `npm run lint`, `npm test`, and
`LOCAL_MOTION_SMOKE_STORAGE='/Users/mm/Library/Application Support/Cursor/User/globalStorage/local-motion.local-motion' LOCAL_MOTION_SMOKE_CONTEXT_TOKENS=2048 npm run smoke:local-runtime`.
The smoke used the cached
`Qwen3-Coder-30B-A3B-Instruct-Q8_0.gguf` model and passed through the proxy
with the generated session key. Cross-agent phase audit produced a clean Codex
artifact at `tmp/cross-agent-audits/phase-audit-Y0ofhr/codex-phase-audit.md`;
Claude exited non-zero because the account was rate-limited (`429`, reset
7:10pm America/Los_Angeles), so the missing reviewer path was covered locally.
The earlier Codex finding was stale static-key documentation; `README.md` and
the cursor private-network guide now describe the current session key instead.

---

### Phase 2: cloudflared tunnel runtime module

**Goal:** A self-contained module that owns the tunnel child process.

**Skills:** `local-motion`, `documentation`

**Tasks:**

- [x] Create `src/runtime/cloudflaredTunnel.ts` (~150 LOC target):
  - `findCloudflared(): string | undefined` — check PATH plus
    `/opt/homebrew/bin/cloudflared` and `/usr/local/bin/cloudflared`
    (mirror the resolver pattern in `llamaServerResolver.ts`).
  - `startQuickTunnel(binPath, port)` — spawn
    `cloudflared tunnel --url http://127.0.0.1:<port>`, parse the first
    `https://<subdomain>.trycloudflare.com` match from stderr/stdout, resolve
    with `{ url, stop() }`; reject after a 30 s startup timeout with the
    captured output in the error message.
  - Exit handling: expose an `onExit` callback so Phase 3 can clear
    `tunnelUrl` and surface a status message when a live tunnel process dies.
  - `stop()` kills the child (SIGTERM, SIGKILL fallback) — this is the kill
    switch; document it in the file header.
- [x] Keep the module pure of vscode imports so it is testable under
  `node --test` like the rest of `src/runtime`.

**Verification:** `npm run check && npm test`; unit tests for URL parsing
(fixture cloudflared output, including the banner noise), timeout path, and
exit-cleanup using a fake child process.

**Mandatory live tunnel spike (gates Phase 3/4 decisions):** run the module
against the live proxy, then drive one **streamed** `chat/completions` through
the trycloudflare URL with `curl -N`. Record whether tokens arrive
incrementally or buffered. If streaming is broken (not merely buffered), stop
and add the `localMotion.cursorTunnelUrl` manual-override setting
(named-tunnel escape hatch) to Phase 3 before proceeding — do not ship a
managed path that can't stream. If the module-created Quick Tunnel hostname
does not resolve within five minutes, treat that as a managed Quick Tunnel
reachability failure, add the same manual override, and proceed only with the
plan explicitly amended; do not claim the managed Quick Tunnel path is proven.

**Phase 2 status:** Complete on 2026-07-01 after the live tunnel gate failed
the managed Quick Tunnel path and Phase 3 was amended with the required
manual/named-tunnel override. Verification run:
`npm run check`, `npm run lint`, `npm test`, and focused
`npm run compile && node --test tests/cursor-tunnel.test.mjs`. The module is
pure runtime code and exposes `onExit` so Phase 3 can clear `RuntimeStatus`
when a live tunnel dies. Live spike results:

- New Quick Tunnel processes printed URLs, but fresh hostnames failed DNS
  resolution for up to 90 seconds in three runs, then for five minutes with a
  fake streaming upstream behind the current `OpenAiProxy` and generated
  session key. This is a Quick Tunnel reachability failure, not an SSE verdict.
- An already-running Quick Tunnel for the same local proxy shape resolved and
  `curl -N` streamed `POST /v1/chat/completions` to `data: [DONE]` through
  `https://ear-parks-relative-voices.trycloudflare.com/v1/chat/completions`
  using `Authorization: Bearer local-motion`. Tokens arrived through SSE;
  this proves SSE works once a `trycloudflare.com` hostname is actually
  reachable.
- Phase 3 must add `localMotion.cursorTunnelUrl` before UI work and treat
  endpoint verification as the real readiness proof; merely parsing a
  `trycloudflare.com` URL is not enough to claim Cursor can reach it yet. The
  managed Quick Tunnel path remains experimental/unproven until a
  module-created hostname resolves and verifies end to end.

---

### Phase 3: Wire tunnel into runtime status and Cursor view model

**Goal:** Opt-in setting, controller lifecycle, and tunnel-aware view model.

**Skills:** `local-motion`

**Tasks:**

- [x] `package.json`: add setting `localMotion.cursorTunnel` (boolean,
  default `false`) with an honest description ("Expose the local proxy to
  Cursor via a Cloudflare Quick Tunnel. Prompts will transit Cursor's servers
  and the tunnel. Applies on the next model start.").
- [x] `package.json`: add setting `localMotion.cursorTunnelUrl` (string,
  default `""`) for a user-managed public HTTPS endpoint, e.g. a Cloudflare
  Named Tunnel. When set, Local Motion must use this URL instead of spawning a
  Quick Tunnel. This was added after the Phase 2 live gate showed new Quick
  Tunnel hostnames can fail DNS resolution for at least five minutes on this
  machine.
- [x] `src/types.ts`: add an explicit tunnel state to `RuntimeStatus`:
  `cursorTunnel?: { enabled: boolean; source?: "managed" | "manual"; url?: string; error?: "binary-missing" | "start-timeout" | "exited" | "dns-unresolved" | "invalid-url"; }`
  — absence of a URL must be distinguishable between setting-off, missing
  binary, timeout, and death, or the webview state machine has to guess.
- [x] `src/runtime/llamaServer.ts`: `LlamaServerManager` owns the tunnel as a
  sibling of `this.proxy` — start it after the proxy binds (when the setting
  is on), stop it on **every** proxy-stop path including the llama-server
  crash `exit` handler (`llamaServer.ts:111-119`) and `deactivate()`. Tunnel
  start failure must NOT fail the model start — the local path keeps working
  and `cursorTunnel.error` explains. If `localMotion.cursorTunnelUrl` is set,
  do not spawn `cloudflared`; surface the manual URL and skip process ownership.
- [x] `src/app/localMotionController.ts`: read the setting at model start,
  pass a tunnel config into the manager, surface `cursorTunnel` in status.
  Toggling either tunnel setting mid-run takes effect on next model start
  (documented in the setting descriptions; no live re-plumbing).
- [x] `src/cursor/cursorIntegration.ts`: `cursorSetupViewModel` uses
  `cursorTunnel.url + "/v1"` when present as the Cursor-facing base URL. When
  the tunnel is absent, the steps/status copy must state plainly that Cursor's
  backend cannot reach a localhost URL and point at the tunnel opt-in (or the
  manual guide) — no more handing out a loopback URL as if it worked.
- [x] Staleness: no code change expected — confirm with a test that a rotated
  tunnel URL flips `cursorSetupFreshness` to `stale`.

**Verification:** `npm run check && npm test`; unit tests: view model prefers
tunnel URL; freshness goes stale across a simulated tunnel restart; each
`cursorTunnel.error` state leaves `running: true` with loopback base URL and
the right copy; **crash-path regression test**: simulated llama-server exit
stops the tunnel (this guards the plan's own kill-switch requirement). The
Extension Development Host proof is deferred to Phase 5 after the Phase 4 UI
controls exist: toggle setting, start model, confirm tunnel URL appears and
`prepareCursor` verifies against it; `kill` the llama-server process and
confirm `pgrep cloudflared` is empty.

**Phase 3 status:** Complete on 2026-07-01. Verification run:
`npm run check`, `npm run lint`, and `npm test` (108 tests). New tests cover:
manual tunnel URL preference, `/v1` suffix normalization, refusal to hand
Cursor a localhost URL, public-HTTPS validation for
`localMotion.cursorTunnelUrl`, staleness on rotated tunnel URLs, tunnel
error-state copy while the local runtime stays up, opt-in/next-start setting
descriptions, managed Quick Tunnel DNS readiness before surfacing a URL, and
behavioral child-exit tunnel kill-switch cleanup used by
`LlamaServerManager`. The
cross-agent audit P1s found in
`tmp/cross-agent-audits/phase-audit-0ctZHx/codex-phase-audit.md` were fixed:
manual URLs now reject localhost/private/HTTP/garbage values with
`invalid-url`, and managed Quick Tunnels now stop and report `dns-unresolved`
when the printed hostname does not resolve.
The follow-up audit P1 in
`tmp/cross-agent-audits/phase-audit-VGupxO/codex-phase-audit.md` was also
fixed: manual tunnel validation now rejects IPv6 literal hosts, including
loopback/private IPv6 and public IPv6 literals, because the manual override
contract is a public HTTPS tunnel hostname.
The later audit P1 in
`tmp/cross-agent-audits/phase-audit-LRc7Te/codex-phase-audit.md` was fixed by
extracting `cursorTunnelConfigFromWorkspace()` and passing it into
`LlamaServerManager` as a default config provider. Controller starts still
pass the config explicitly, and provider-initiated VS Code LM starts now use
the same next-start tunnel settings instead of bypassing them.
The P2/P3 verification drift found in
`tmp/cross-agent-audits/phase-audit-j8jBIk/codex-phase-audit.md` was fixed by
extracting `attachRuntimeChildExitHandler()` and adding
`runtime child exit cleanup stops the tunnel kill switch` in
`tests/cursor-tunnel.test.mjs`; the Phase 3 verification text now explicitly
defers Extension Development Host UI/process proof until the Phase 4 UI
controls exist and the Phase 5 manual gate runs.
Final Phase 3 audit artifact:
`tmp/cross-agent-audits/phase-audit-b6crXm/codex-phase-audit.md` reported no
P0-P2 findings and marked the phase ready to commit; Claude remained
unavailable due account rate limit (`429`, reset 7:10pm America/Los_Angeles).

---

### Phase 4: Setup webview — opt-in UI and honest copy

**Goal:** The user can enable the tunnel from setup and cannot miss the
privacy tradeoff.

**Skills:** `jony-ive`, `david-ogilvy`, `local-motion`

**Tasks:**

- [x] `src/ui/setupPanelHtml.ts` (+ `setupPanelStyles.ts`,
  `setupProtocol.ts`, `setupPanel.ts` as needed): add a Cursor-connection
  section state machine:
  - tunnel off → explain why localhost cannot work with Cursor and offer
    "Turn on Cursor tunnel" (writes the setting via a new protocol message);
  - tunnel on, cloudflared missing → show copyable
    `brew install cloudflared` step;
  - tunnel on and up → show the trycloudflare base URL in the existing copy
    fields.
- [x] Replace privacy-implying Cursor copy: "Runs a coding model on this Mac
  for Cursor" → "Runs the model on this Mac. Cursor routes prompts through its
  servers and the tunnel."; "Cursor is using your local model." → "Cursor is
  using your local model — local compute, Cursor-routed prompts." Audit every
  Cursor-path string in `setupPanelHtml.ts` and `cursorIntegration.ts` for
  "private"/"local-only" claims.
- [x] One-line disclosure adjacent to the enable control, permanent (not a
  dismissable toast): "Prompts and files sent from Cursor transit Cursor's
  backend and a Cloudflare tunnel. Anyone with the URL and key can reach the
  proxy while the tunnel is up. Cursor's Zero Data Retention does not apply to
  custom keys."
- [x] Do not touch VS Code (`vscode.lm`) path copy — it remains "fully local"
  and must stay accurate.

**Verification:** `npm run check && npm test` (extension-wiring tests updated
for the new protocol message); copy-audit gate:
`grep -rniE "private|local-only|local endpoint|fully local" README.md package.json src/ui src/cursor`
and review every hit — Cursor-path claims must read "local compute,
Cursor-routed prompts"; note `package.json` currently says "private local
coding agent" and must be reworded honestly (VS Code path may keep "fully
local"). Not testable in this shell: manual Extension Development Host pass
per the repo's Local Testing procedure. That interactive UI proof remains in
the final Phase 5 manual gate.

**Phase 4 status:** Complete on 2026-07-01. Verification run:
`npm run check`, `npm run lint`, and `npm test` (108 tests). The setup webview
now shows a tunnel-enable action when Cursor has no public Base URL, a copyable
`brew install cloudflared` fallback when the managed tunnel is enabled but the
binary is missing, and the existing Cursor copy fields only when a public
tunnel URL exists. The permanent disclosure is in the connect card. Copy audit
run:
`grep -rniE "private|local-only|local endpoint|fully local" README.md package.json src/ui src/cursor`.
Reviewed hits: README private-state and private-network language is accurate,
source `private` hits are TypeScript member visibility, and Cursor-path copy now
uses local compute / Cursor-routed prompts.
The Phase 4 audit P3 in
`tmp/cross-agent-audits/phase-audit-59gM2G/codex-phase-audit.md` was fixed:
after clicking "Turn on Cursor tunnel" during an active run, the setup panel now
remembers that the tunnel is enabled for the next start, hides the repeated
enable button, and shows the restart instruction. The audit P2 was not a code
bug; the plan now explicitly records the Extension Development Host pass as
not testable in this shell and defers it to the final manual gate.
Final Phase 4 audit artifact:
`tmp/cross-agent-audits/phase-audit-UwQaj2/codex-phase-audit.md` reported no
P0-P2 findings and marked the phase commit-ready; Claude remained unavailable
due account rate limit (`429`, reset 7:10pm America/Los_Angeles).

---

### Phase 5: Docs, regression tests, cleanup

**Goal:** Repo belief matches shipped behavior; the fix is guarded.

**Skills:** `markdown`, `write-notes`

**Tasks:**

- [x] `README.md`: Cursor section describes the tunnel opt-in, the install
  prerequisite, and the honest privacy framing; VS Code section keeps the
  fully-local claim.
- [x] Cross-link this plan from the
  [field guide](../Guides/cursor-private-network-block-guide.md) (guide copied
  into this branch at plan time; reconcile with `main` on merge).
- [x] Named regression tests (in `tests/`): `cursor-tunnel.test.mjs` covering
  URL parse, key auth rejection of the legacy static key, view-model base-URL
  preference, and staleness on rotation.
- [ ] `Not testable:` the live trycloudflare round-trip and Cursor's backend
  behavior — record the manual proof (one real Cursor chat message, not the
  Verify button, per guide §4.5) in README/Notes via `write-notes`.

**Verification:** `npm run check && npm run lint && npm test` all green;
manual end-to-end: real Cursor chat message succeeds through the tunnel;
stopping the model kills `cloudflared` (verify with `pgrep cloudflared`).

**Phase 5 status:** Blocked on 2026-07-01 for manual Cursor/Extension
Development Host proof; repository artifacts and local automated verification
are complete. Verification run: `npm run check`, `npm run lint`,
`npm test` (108 tests), and
`grep -rniE "private|local-only|local endpoint|fully local" README.md package.json src/ui src/cursor`.
`README.md` now describes the opt-in Cursor tunnel,
`cloudflared` prerequisite/manual URL override, and Cursor privacy framing.
The field guide links back to this plan. `README/Notes/cursor-tunnel.md`
records the proof matrix and the remaining manual gap. Not testable in this
shell: real Cursor backend chat, Extension Development Host UI proof, and
`pgrep cloudflared` after model stop. The CLI can open Cursor but cannot invoke
Cursor chat or extension commands, and this machine already had unrelated
`cloudflared` processes running. Completing this phase requires an interactive
Cursor/VS Code Extension Development Host session; the note records that
explicitly instead of claiming release proof.

## Executable Memory

- Regression test: `node --test tests/cursor-tunnel.test.mjs`
- Not testable: Cursor-backend end-to-end (vendor cloud in the loop) — manual
  proof is one real chat message in Cursor against the tunnel URL, plus
  `pgrep cloudflared` returning nothing after model stop.

## Success Criteria

### Hard Requirements (Must Pass)

- [ ] A real Cursor chat message completes through the tunnel path.
- [ ] Proxy rejects `Bearer local-motion` and any wrong key with 401.
- [ ] Tunnel never outlives the proxy; model stop → no cloudflared process.
- [ ] Tunnel off/failed → local `vscode.lm` path fully functional, unchanged.
- [ ] No Cursor-path surface claims "fully private" or "fully local".
- [ ] Restarting the model rotates the URL and freshness reports `stale`.

### Definition of Done

- [ ] All tests passing (`npm run check`, `npm run lint`, `npm test`).
- [ ] Manual Extension Development Host pass recorded in README/Notes.
- [ ] Docs updated (README + guide cross-links).

## Open Questions

### Resolved

- **Q:** Docs-only manual tunnel vs managed child process?
- **A:** Managed, opt-in. Rotation-per-restart makes docs-only a per-session
  chore with guaranteed silent staleness; managed mode reuses shipped
  freshness/verify machinery and follows the existing llama-server
  child-process pattern. Docs remain the fallback when cloudflared is absent.
- **Q:** Random key only when tunneled, or always?
- **A:** Always. One code path, no mode flag, no risk of exposing the static
  key through a later tunnel toggle. The vscode.lm path passes the key
  in-process and is unaffected.
- **Q:** Auto-install cloudflared?
- **A:** No. Show the brew command. Installing network daemons silently is
  the wrong trust posture for a privacy-sensitive feature.

- **Q:** Quick Tunnel SSE — accept buffered, or escape hatch?
- **A:** Decided by the mandatory Phase 2 spike: incremental or merely
  buffered-but-working → ship v1 as experimental opt-in; broken → add the
  `localMotion.cursorTunnelUrl` named-tunnel override in Phase 3 before any
  UI work. No longer open — the gate is written into Phase 2.
- **Q:** Does toggling `localMotion.cursorTunnel` apply live?
- **A:** Next model start only; stated in the setting description. Live
  re-plumbing adds lifecycle states for no real user value.

### Unresolved

- **Q:** Does the `cursor-agent` CLI share the backend SSRF block? (Guide §7.)
  If it allows localhost, a docs-only CLI path could serve some users with
  zero tunnel. Test is 5 minutes but needs the CLI installed; out of scope
  here.

## References

### Internal

- [Cursor private-network block field guide](../Guides/cursor-private-network-block-guide.md)
  (checked into this branch)
- [Plan 001 — Cursor model picker setup](001-cursor-model-picker-setup-plan.md)
- [VS Code local AI guide](../Guides/vs-code-local-ai-hugging-face-guide.md)

### External

- [Cursor BYOK docs (backend routing, ZDR carve-out)](https://cursor.com/help/models-and-usage/api-keys)
- [Quick Tunnel docs (SSE limitation)](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)

## Modules

### Error Handling and Edge Cases

| Scenario | Behavior | Fallback |
| --- | --- | --- |
| cloudflared not installed | Model starts normally; setup shows install step | Docs-only manual tunnel per guide §5 |
| Tunnel startup timeout (30 s) | Status message with captured output; loopback status unchanged | Retry button / restart model |
| Tunnel process dies mid-session | `tunnelUrl` cleared, freshness → stale, status explains | User restarts model to respawn |
| User on Cursor free plan | Cursor errors "Named models unavailable" (vendor-side) | Copy in guide; not detectable by us |
| Wrong/legacy bearer key | 401 before any upstream work | — |

### Files Likely to Change

| File | Change Type | Notes |
| --- | --- | --- |
| `src/runtime/openAiChat.ts` | Modify | random key gen, parameterized auth |
| `src/runtime/openAiProxy.ts` | Modify | session key ownership |
| `src/runtime/openAiStream.ts` | Modify | thread session key |
| `src/runtime/llamaServer.ts` | Modify | owns tunnel next to proxy; crash-path stop |
| `src/runtime/cloudflaredTunnel.ts` | Create | tunnel child-process module |
| `src/provider/localMotionProvider.ts` | Modify | parameterized stream call (behavior unchanged) |
| `src/stateValidation.ts` | Modify | both apiKeyLabel validators, legacy-tolerant |
| `scripts/smoke-local-runtime.mjs` | Modify | stop importing static key |
| `tests/pure-logic.test.mjs` | Modify | ~15 key/label assertions rewritten |
| `src/types.ts` | Modify | `apiKey?`, `cursorTunnel?` state, apiKeyLabel widening |
| `src/cursor/cursorIntegration.ts` | Modify | tunnel-aware base URL, copy |
| `src/cursor/cursorSetupWorkflow.ts` | Modify | key from status |
| `src/app/localMotionController.ts` | Modify | tunnel lifecycle |
| `src/ui/setupPanelHtml.ts` | Modify | opt-in UI, honest copy |
| `src/setupProtocol.ts` | Modify | tunnel toggle message |
| `package.json` | Modify | `localMotion.cursorTunnel` setting |
| `tests/cursor-tunnel.test.mjs` | Create | regression tests |

### Risks and Mitigations

- **Public endpoint abuse:** anyone with URL+key can burn local compute →
  random per-session key, URL rotates per session, tunnel dies with the
  proxy, permanent disclosure copy.
- **cloudflared output format drift breaks URL parsing:** parse by
  `trycloudflare.com` regex over the whole stream, not line position; fixture
  test with real captured output.
- **Orphaned cloudflared processes:** stop on every proxy stop path and on
  `deactivate()`; SIGKILL fallback; verification step checks `pgrep`.
- **Cursor backend timeout on slow models:** documented vendor budget (guide
  §3); status copy sets expectation; not fixable locally.

---

## Critical Reminder

> SIMPLER IS BETTER. One new module, one setting, one honest sentence. If a
> phase starts growing config files, accounts, or a second tunnel provider,
> stop and cut it.
