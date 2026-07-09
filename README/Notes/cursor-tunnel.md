# Cursor Tunnel Debug Notes

Institutional memory for Local Motion's Cursor tunnel handoff and the private
network block that forced it.

**Quick filter:** `grep -n "— Active" README/Notes/cursor-tunnel.md`

---

## Issue: Cursor Chat "Model name is not valid" — Active

**First spotted:** 2026-07-08
**Status:** Active (vendor gate; Local Motion handoff hardened)

### Summary

Cursor chat can show `Model name is not valid` after Local Motion assisted
setup. The string is not emitted by Local Motion. Local endpoint verification
and `curl` to `/v1/models` + `/v1/chat/completions` can succeed while Cursor
still rejects the custom model name via its own catalog validation.

### Symptom

```text
Model name is not valid
```

(or `Model name is not valid: ""` / `Model name is not valid: "Local Motion"`)

### Root Cause

Cursor BYOK validates custom model names against its catalog before forwarding
to the Override OpenAI Base URL. Empty model (API key toggle off) and
unrecognized names are documented failure modes. Local Motion's id
`Local Motion` is hijack-safe but still subject to Cursor's gate.
Not manually confirmed on this machine's Cursor build for the empty-string vs
catalog-reject split.

### Related Guides

- [Cursor private-network block guide](../Guides/cursor-private-network-block-guide.md) — diagnostic sequence and model-name section.

### Fix

**Files:**

- `src/cursor/cursorIntegration.ts` — honest Add Custom Model steps; status
  message names the Cursor-side error.
- `src/runtime/openAiChat.ts` — proxy always rewrites chat `model` to the
  advertised single-model id (does not fix Cursor pre-request rejection).
- `src/ui/setupPanelHtml.ts`, `src/extension.ts` — stop hardcoding the brand
  string; use `LOCAL_MOTION_MODEL_ID`.

Do **not** invent a second `cursorModelId` or rename to a catalog alias without
a named Cursor repro — that trades hijack risk for speculative validation
bypass.

### Verification

```bash
npm run check
npm test
```

Manual: with tunnel + session key, run the guide's local `curl` with
`"model":"Local Motion"`. If curl works and Cursor chat still fails, capture
the exact error string (empty vs named) and Cursor version.

### Executable Memory

Regression test: `tests/pure-logic.test.mjs` (always-rewrite model; setup copy)
Regression test: `tests/extension-wiring.test.mjs` (Add Custom Model wording)
Not testable: Cursor-backend catalog validation end-to-end
Memory updates: none

### If This Recurs

- [ ] Prove local stack with guide §4 step 1 `curl`.
- [ ] Confirm OpenAI API Key toggle on and custom model selected (not Auto).
- [ ] Check Cursor version / Help > Check for Updates (staff claimed catalog
      rejection fixed 2026-07-08 in forum thread 155863).
- [ ] Do not change `LOCAL_MOTION_MODEL_ID` without a measured Cursor failure
      that a specific slug fixes.

---

## Issue: Cursor Backend Cannot Reach Loopback Base URLs — Resolved

**First spotted:** 2026-07-01
**Resolved:** 2026-07-01
**Status:** Resolved

### Summary

Cursor custom-model requests originate from Cursor's backend, not the local
machine, so `127.0.0.1` and private-network Base URLs fail with Cursor's SSRF
guard. Local Motion turns on local compute first, keeping `llama-server` and
the proxy bound to loopback. The public HTTPS tunnel starts only during
`Connect Cursor to Local Agent`; in real VS Code the `vscode.lm` path stays
fully local. There is no tunnel setting; `localMotion.cursorTunnelUrl` remains
the manual override, and the privacy consequence is stated permanently in the
connect card.

### Symptom

```text
Provider returned error: Access to private networks is forbidden
```

### Root Cause

Cursor routes BYOK requests through its servers for final prompt building. A
localhost Base URL points at Cursor's server, not the user's Mac, and is blocked
before it can reach Local Motion.

### Related Guides

- [Cursor private-network block guide](../Guides/cursor-private-network-block-guide.md) - Vendor contract and tunnel options.
- [Honest Cursor Tunnel Handoff Plan](../Plans/002-cursor-tunnel-handoff-plan.md) - Implementation and phase evidence.

### Fix

**Files:**

- `src/runtime/openAiChat.ts`
- `src/runtime/openAiProxy.ts`
- `src/runtime/cloudflaredTunnel.ts`
- `src/runtime/llamaServer.ts`
- `src/runtime/runtimeChildExit.ts`
- `src/app/cursorTunnelConfig.ts`
- `src/cursor/tunnelUrl.ts`
- `src/cursor/cursorIntegration.ts`
- `src/ui/setupPanelHtml.ts`
- `src/setupProtocol.ts`

Local Motion now uses a generated per-session bearer key, requires bearer auth
on every proxy route, owns the optional `cloudflared` child next to the proxy,
starts that child only for the explicit Cursor handoff, validates manual tunnel
URLs as public HTTPS hostnames, checks managed tunnel DNS before surfacing a
URL, and shows honest Cursor copy: local compute, Cursor-routed prompts.

### Verification

```bash
npm run check
npm run lint
npm test
LOCAL_MOTION_SMOKE_STORAGE='/Users/mm/Library/Application Support/Cursor/User/globalStorage/local-motion.local-motion' LOCAL_MOTION_SMOKE_CONTEXT_TOKENS=2048 npm run smoke:local-runtime
grep -rniE "private|local-only|local endpoint|fully local" README.md package.json src/ui src/cursor
```

Phase evidence:

- Phase 1 smoke passed with cached `Qwen3-Coder-30B-A3B-Instruct-Q8_0.gguf`.
- Phase 2 proved fresh Quick Tunnel hostnames can fail DNS resolution for five minutes on this machine; an older already-resolved Quick Tunnel streamed `data: [DONE]` through the proxy.
- Phase 3 and Phase 4 gates passed with 108 tests.
- Cross-agent Codex phase audits ended with no P0-P2 findings for Phases 3 and 4; Claude audits were unavailable because the account was rate-limited (`429`, reset 7:10pm America/Los_Angeles).

### Executable Memory

Regression test: `tests/cursor-tunnel.test.mjs`
Regression test: `tests/pure-logic.test.mjs`
Regression test: `tests/extension-wiring.test.mjs`
Not testable: Cursor-backend end-to-end and Extension Development Host UI proof were not run in this shell. `cursor --help` exposes no command invocation path for `localMotion.open` or Cursor chat, and this machine already had unrelated `cloudflared tunnel --url http://127.0.0.1:41434` processes running, so `pgrep cloudflared` could not prove this branch's managed tunnel was killed. Completion requires an interactive Cursor/VS Code Extension Development Host session, one real Cursor chat message through the tunnel, and `pgrep cloudflared` after stopping that session's model.
Memory updates: none

### If This Recurs

- [ ] Confirm Cursor setup is using a public HTTPS tunnel URL, not `127.0.0.1`.
- [ ] Verify the session bearer key is current; stale copied values should show stale in setup.
- [ ] Check `localMotion.cursorTunnelUrl` first when managed Quick Tunnel DNS fails.
- [ ] Run `node --test tests/cursor-tunnel.test.mjs` before changing tunnel lifecycle code.
