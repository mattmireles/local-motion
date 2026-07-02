# Cursor Tunnel Debug Notes

Institutional memory for Local Motion's Cursor tunnel handoff and the private
network block that forced it.

**Quick filter:** `grep -n "— Active" README/Notes/cursor-tunnel.md`

---

## Issue: Cursor Backend Cannot Reach Loopback Base URLs — Resolved

**First spotted:** 2026-07-01
**Resolved:** 2026-07-01
**Status:** Resolved

### Summary

Cursor custom-model requests originate from Cursor's backend, not the local
machine, so `127.0.0.1` and private-network Base URLs fail with Cursor's SSRF
guard. Local Motion now exposes Cursor setup through a public HTTPS tunnel
that starts automatically with the model when the extension host is Cursor
(never in real VS Code — the `vscode.lm` path stays fully local), while
keeping `llama-server` and the proxy bound to loopback. There is no tunnel
setting; `localMotion.cursorTunnelUrl` remains the manual override, and the
privacy consequence is stated permanently in the connect card.

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
validates manual tunnel URLs as public HTTPS hostnames, checks managed tunnel
DNS before surfacing a URL, and shows honest Cursor copy: local compute,
Cursor-routed prompts.

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
