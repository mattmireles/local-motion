# Cursor Tunnel Debug Notes

Institutional memory for Local Motion's Cursor tunnel handoff and the private
network block that forced it.

**Quick filter:** `grep -n "— Active" README/Notes/cursor-tunnel.md`

---

## Issue: Home-router NXDOMAIN kills working Quick Tunnels — Resolved

**First spotted:** 2026-07-09
**Resolved:** 2026-07-09
**Status:** Resolved

### Summary

Connect to Cursor failed with "The Cursor connection did not become reachable"
even though `cloudflared` had registered a Quick Tunnel. Local `dns.lookup` /
router dig returned NXDOMAIN for fresh `*.trycloudflare.com` names while
Cloudflare DNS-over-HTTPS already had the A record. The old probe killed the
working tunnel after 90s. Fixed by DoH resolve + HTTPS probe to the IP with
SNI/Host, requiring origin `/health` 401/2xx (not Cloudflare edge 530/502).

### Symptom

```text
The Cursor connection did not become reachable. Turn the local agent off and on to retry…
Cursor settings were not opened because endpoint verification failed. Start a local model before verifying Cursor setup.
```

Connect button appeared to do nothing (card hid under "Starting local agent").

### Root Cause

1. Readiness used `dns.lookup` (system/router resolver). Some home routers
   NXDOMAIN fresh trycloudflare hostnames; Cursor's backend uses public DNS.
2. Probe success accepted any HTTP status — Cloudflare 530/1033 would have
   been a false positive once DoH worked.
3. Connect UX hid the connect card during the wait.

### Related Guides

- [Cursor private-network block guide](../Guides/cursor-private-network-block-guide.md)
- [Honest Cursor Tunnel Handoff Plan](../Plans/002-cursor-tunnel-handoff-plan.md)

### Fix

**Files:**

- `src/runtime/tunnelReachability.ts` — DoH (Cloudflare + Google) + SNI HTTPS
  `/health`; `isOriginHealthStatus` requires 401 or 2xx.
- `src/runtime/llamaServer.ts` — up to 3 Quick Tunnel attempts with fresh
  hostnames; stop failed children before retry; abort the current probe when
  cloudflared exits mid-wait so a dead child does not burn the full timeout.
- `src/ui/setupPanelHtml.ts` — Connecting… card stays visible; static Setup
  guide; honest verify copy when tunnel missing.
- `src/cursor/cursorSetupWorkflow.ts` / `cursorIntegration.ts` — clearer
  failure messages.

### Verification

```bash
npm run check && npm test
# Live: spawn cloudflared Quick Tunnel to :41434, then:
node -e "import('./out/runtime/tunnelReachability.js').then(m=>m.tunnelHttpReachable(process.argv[1],60000).then(console.log))" "$URL"
# Expect true in ~4–10s while plain fetch still ENOTFOUND on this Mac.
```

### Executable Memory

Regression test: `tests/cursor-tunnel.test.mjs` (`ipv4FromDohAnswer`,
`isOriginHealthStatus`, abort)
Regression test: `tests/extension-wiring.test.mjs` / `serialization-contract.test.mjs`
Not testable: Cursor-backend chat through the tunnel from this shell
Memory updates: none

### If This Recurs

- [ ] Confirm plain `dig`/`dns.lookup` NXDOMAIN while DoH returns an A record.
- [ ] Confirm probe requires 401/2xx, not 530/502.
- [ ] Set `localMotion.cursorTunnelUrl` to a Named Tunnel if Quick Tunnels stay flaky.
- [ ] Reload Cursor after reinstalling the VSIX.

---

## Issue: Stale Plan-001 loopback lastCopied — Resolved

**First spotted:** 2026-07-08
**Resolved:** 2026-07-08
**Status:** Resolved

### Summary

Setup panel showed last-copied `http://127.0.0.1:41434/v1` from
2026-07-01 while the agent was on with no public tunnel. Current code never
writes loopback into `lastCopied`; the record was a Plan 001 fossil that
survived upgrades because validators accepted any non-empty Base URL.

### Symptom

```text
Last copied values were for Local Motion at http://127.0.0.1:41434/v1
Base URL field shows status text, not https://….trycloudflare.com
Full Setup: Unavailable until Cursor connection is ready
```

### Root Cause

`isLastCopiedCursorSetup` did not require public HTTPS. Pre-tunnel copies
with `apiKeyLabel: "local-motion"` stayed in Cursor `globalStorage` and
poisoned freshness messaging.

### Fix

- `src/stateValidation.ts` — require public HTTPS Base URL and
  `apiKeyLabel: "session-key"`.
- Cleared this machine's stale `localMotion.lastCopiedCursorSetup` from
  Cursor `state.vscdb`.

### If This Recurs

- [ ] Confirm Base URL in Local Motion is `https://…`, not `127.0.0.1`.
- [ ] In Cursor Models, Override OpenAI Base URL must match that public URL.
- [ ] Click Open Cursor Settings again after reload so a fresh tunnel copy lands.

---

## Issue: Cursor Chat "Model name is not valid" — Resolved

**First spotted:** 2026-07-08
**Resolved:** 2026-07-09
**Status:** Resolved

### Summary

Cursor 3.10.20 listed and selected `Local Motion` but rejected chat before the
proxy received a request. Cursor had saved the session key and enabled the Base
URL override, but the separate OpenAI API-key provider toggle was off. Turning
that provider on made the exact spaced `Local Motion` identifier work; no alias
or model rename was required.

### Symptom

```text
Model name is not valid: "Local Motion"
```

### Root Cause

Cursor persisted `useOpenAIKey: false` even though the key field said
`Secret saved`, the Base URL override was on, and `Local Motion` appeared in the
picker. With the provider disabled, Cursor rejected the selection before
custom-endpoint routing.

The repair exposed a second local defect: the managed Quick Tunnel passed the
DoH + SNI reachability probe, but final authenticated `/v1/models`
verification still used ordinary `fetch`. The home router's stale NXDOMAIN
therefore produced `fetch failed` and blocked setup copy even though Cursor's
backend could resolve and use the tunnel.

### Related Guides

- [Cursor private-network block guide](../Guides/cursor-private-network-block-guide.md) — diagnostic sequence and model-name section.
- [Cursor custom-model validation guide](../Guides/cursor-custom-model-validation-guide.md)
  — verified provider state, failure matrix, and live proof procedure.

### Fix

**Files:**

- `src/cursor/cursorIntegration.ts` — honest Add Custom Model steps; status
  and copied setup now say to turn on OpenAI API Key before selecting the
  model.
- `src/ui/setupPanelHtml.ts` — ready-state lead, permanent setup guide, and
  post-copy note all name the required provider toggle.
- `src/runtime/tunnelReachability.ts` — final authenticated verification falls
  back to public DNS-over-HTTPS and connects by IP with TLS SNI / Host
  preserved after local DNS failure.
- `src/app/localMotionController.ts` — Cursor setup verification uses that
  public-DNS fallback.

Do **not** invent a second `cursorModelId` or rename to a catalog alias without
a measured Cursor repro. The create-guide draft proposed `cus-local-motion`,
but the live test falsified the premise: `Local Motion` worked unchanged once
the provider toggle was on.

### Verification

```bash
npm run check
npm run lint
npm test
npm run package
```

All gates passed with 142 tests. The rebuilt VSIX installed successfully in
Cursor 3.10.20.

Live proof 1 repaired the current settings in Cursor, selected `Local Motion`,
submitted `Reply with exactly: LOCAL MOTION WORKS`, and rendered
`LOCAL MOTION WORKS`.

Live proof 2 used the rebuilt extension. A fresh Quick Tunnel succeeded through
the public-DNS fallback, setup reported ready, Cursor selected `Local Motion`,
and `Reply with exactly: FIXED BUILD WORKS` rendered `FIXED BUILD WORKS`.
The active `llama-server` log recorded 13,516 prompt tokens and six generated
tokens for that request.

### Executable Memory

Regression test: `tests/cursor-tunnel.test.mjs` (`Cursor endpoint verification falls back to public DNS after local router NXDOMAIN`)
Regression test: `tests/extension-wiring.test.mjs` (`Cursor setup instructions match Cursor's Add Custom Model flow`)
Regression test: `tests/pure-logic.test.mjs` (setup block requires both OpenAI toggles)
Memory updates: none

### If This Recurs

- [ ] Confirm OpenAI API Key is on; `Secret saved` alone is not enough.
- [ ] Copy the current session key and tunnel URL after every Local Motion
      restart.
- [ ] Require one real Cursor chat response; `/v1/models` alone is not proof.
- [ ] If setup says `fetch failed`, test public DoH before blaming the tunnel.
- [ ] Do not rename `LOCAL_MOTION_MODEL_ID` without an A/B Cursor repro.

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
