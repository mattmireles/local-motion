# Cursor "Access to private networks is forbidden" Debugging Field Guide

July 1, 2026

## Related Documentation

- **[Local Native LLM Extensions for VS Code and Cursor on macOS](vs-code-local-ai-hugging-face-guide.md)**:
  Sidecar architecture background; Phase 6 covers the instruction-only Cursor
  setup path this guide constrains.
- **[Cursor Model Picker Setup Plan](../Plans/001-cursor-model-picker-setup-plan.md)**:
  Product contract for assisted Cursor setup (no private-state mutation).
- **[Honest Cursor Tunnel Handoff Plan](../Plans/002-cursor-tunnel-handoff-plan.md)**:
  Implementation record for the opt-in tunnel handoff, session bearer key,
  manual tunnel override, and verification gaps.

## 1. Problem Frame

**Symptom.** Local Motion's assisted Cursor setup completes cleanly: the proxy
verifies locally, values are copied, the custom model appears in Cursor's model
dropdown. The first real chat message (observed in Agent mode) fails with a
Provider Error dialog:

```text
Provider returned error: Access to private networks is forbidden
Copy Request (<uuid>)
```

**Environment.** Cursor on macOS, current builds as of 2026-07-01. Local Motion
proxy on `http://127.0.0.1:41434/v1`, using the current session key shown in
the setup panel. The local stack is provably healthy: `GET /v1/models` and
streamed `/v1/chat/completions` both succeed via curl against the loopback
proxy.

**Root cause (confirmed, not inference).** Cursor routes every custom-API-key
(BYOK) model request through its cloud backend. The official docs say it
verbatim:

> "Your API key is not stored on our servers. It is sent to our backend with
> every request because all requests are routed through Cursor's servers for
> final prompt building."
> — [cursor.com/help/models-and-usage/api-keys](https://cursor.com/help/models-and-usage/api-keys)
> (fetched 2026-07-01)

The HTTP request to your Override OpenAI Base URL originates from **Cursor's
servers, not your machine**. A loopback or RFC-1918 base URL is therefore
unreachable by definition, and Cursor's backend rejects it up front with a
server-side SSRF filter — that filter's message is the exact error above.
Cursor staff (deanrie, 2026-01-20): "our backend calls your API endpoint, so it
has to be reachable from our side… The architecture doesn't support direct
connections to localhost or LAN addresses."

**Consequence for Local Motion.** Pasting `http://127.0.0.1:41434/v1` into
Cursor Settings → Models can never work, in any Cursor build with this
architecture. This is a vendor design decision, not a bug in the proxy, the
port, TLS, HTTP/2 settings, or the copied values.

## 2. Failure Surface Map

Which Cursor surfaces do what with a custom base URL (2026 builds):

| Surface | Behavior with custom model + base URL override |
| --- | --- |
| Chat / Ask (`Cmd+L`) | Attempted via Cursor's backend → your base URL. Works through a public HTTPS tunnel. |
| Agent mode | Attempted in current 2026 builds (this is why the SSRF 403 surfaces there). Staff messaging is inconsistent on official support; payload-format issues against plain `/v1` endpoints are staff-acknowledged. Treat as best-effort. |
| Inline Edit (`Cmd+K`) | Historically gated with BYOK ("Agent and Edit rely on custom models that cannot be billed to an API key", 2025 era). Verify per build. |
| Tab autocomplete | **Never** uses custom keys/base URLs. Official: "Custom API keys only work with chat models. Tab completion continues using Cursor's built-in models." |
| Apply / Auto model / Composer models | Never routed to custom endpoints. Composer models error with BYOK ("This model does not support custom APIs"). |
| Settings → Models Verify button | Credentials/format check only. Multiple reports (Dec 2024, Apr 2025) of Verify passing against `127.0.0.1` while chat then 403s. **A green Verify does not prove Cursor's backend can reach your URL.** |

Other relevant constraints, all confirmed 2026-07-01 unless dated:

- **BYOK requires a paid Cursor plan** since ~2026-01-31. Free plans fail with
  "Named models unavailable. Free plans can only use Auto." before or instead
  of the SSRF 403.
- **No native local-model mode exists.** Official docs list only five hosted
  BYOK providers (OpenAI, Anthropic, Google, Azure OpenAI, AWS Bedrock); zero
  mentions of localhost, Ollama, LM Studio, or llama.cpp anywhere in the docs
  sitemap. Staff (2026-05-22): bypassing Cursor's servers is "an architectural
  limitation" because "prompt building, context retrieval, and Cursor Tab and
  Agent run on our side."
- **No extension escape hatch.** Cursor does not implement the VS Code LM API:
  `vscode.lm.selectChatModels()` returns 0 models, there is no provider
  registration surface, and staff confirmed `vscode.lm` tools APIs are
  unsupported (2026-02-21). Local Motion's VS Code provider path does not exist
  inside Cursor.
- **No enterprise escape hatch (publicly).** Cursor's enterprise "Private
  Connectivity" (AWS PrivateLink / Cloudflare Tunnel) covers private source
  control only, not model endpoints. Staff referred private-model questions to
  enterprise support (2026-01-29); nothing public documents an answer.
- **The override is global.** Enabling Override OpenAI Base URL captures
  Cursor's built-in models too — a known, staff-acknowledged limitation. Users
  must toggle the override off to use Cursor-native models again.
- **BYOK voids Cursor's Zero Data Retention.** Official docs: ZDR "does not
  apply when you use your own API keys."

## 3. Known Bugs and Confirmed Vendor Limits

- The exact 403 string "Access to private networks is forbidden" is documented
  in the wild since at least 2025-04-14
  ([forum thread 79166](https://forum.cursor.com/t/problem-accessing-models-through-internal-proxy/79166)).
  Around Cursor ~2.3.x (Jan 2026) some builds return a structured
  `ssrf_blocked` JSON instead — same cause, different rendering.
- Staff answers endorse tunnels by name (deanrie, 2026-02-25): "You'll need to
  expose your Ollama instance as a public HTTPS endpoint using something like
  ngrok or Cloudflare Tunnel."
- Cursor's backend sends a **nonstandard request shape** to custom
  `/chat/completions` endpoints in some scenarios (staff-acknowledged; gateways
  shipped dedicated `/cursor` endpoints — LiteLLM `/cursor`, OpenRouter
  `/api/v1/cursor` — to normalize it). Expect occasional malformed tool-call
  payloads in Agent contexts against a plain `/v1` endpoint. The exact payload
  spec is undocumented and unstable.
- **Model-name hijacking:** if the custom model name matches a name Cursor
  recognizes (or contains characters Cursor strips, like colons), requests can
  be misrouted to Cursor's own provider path (staff-acknowledged, Feb 2026).
  Use an unrecognized name. Local Motion's model ID (`Local Motion`) is safe.
- Cursor Settings → Network → **HTTP Compatibility Mode** (force HTTP/1.1)
  fixes *client-side* TLS/HTTP2 failures against custom endpoints ("Client
  network socket disconnected before secure TLS connection was established",
  staff-prescribed 2026-02-26). It does **not** affect the backend's outbound
  call and cannot fix the private-network 403. Forcing HTTP/1.1 risks
  degrading Tab and indexing (HTTP/2-only pipelines).
- Backend timeout budget for slow custom endpoints is real but unquantified
  (timeout reports with slow local models, Feb 2025). A model that streams
  slowly through a tunnel may be killed by Cursor's backend.

## 4. Diagnostic Sequence

Run in order; stop at the first failure.

1. **Prove the local stack** (rules out everything repo-side):

   ```bash
   curl -s -H "Authorization: Bearer <session-key>" http://127.0.0.1:41434/v1/models
   curl -s -H "Authorization: Bearer <session-key>" -H "Content-Type: application/json" \
     -d '{"model":"Local Motion","messages":[{"role":"user","content":"Say OK."}],"max_tokens":8}' \
     http://127.0.0.1:41434/v1/chat/completions
   ```

   Both succeed → the failure is Cursor-side by elimination.

2. **Check the base URL class.** If Cursor's Override OpenAI Base URL is
   loopback (`127.0.0.1`, `localhost`), RFC-1918 (`10.x`, `172.16-31.x`,
   `192.168.x`), or an address only reachable inside a VPN/tailnet, the SSRF
   403 is expected and nothing local will change it. Go to §5.

3. **Check the Cursor plan.** Free plan → BYOK custom models are refused with
   the "Named models unavailable" error regardless of reachability. A paid
   plan is a precondition, not a workaround.

4. **Prove public reachability from a third network** (after standing up a
   tunnel), e.g. from any external host or `curl --resolve` sanity checks:

   ```bash
   curl -s -H "Authorization: Bearer <session-key>" https://<tunnel-host>/v1/models
   ```

5. **Test with a real chat message, not the Verify button.** Verify has
   documented false positives against unreachable URLs. Select the custom
   model explicitly (not Auto) in Ask/Chat and send one message.

6. **If chat works but Agent misbehaves**, suspect the nonstandard payload
   shape (§3), not reachability — capture the request in the proxy log before
   changing anything else.

## 5. Workarounds and Fix Patterns

There is exactly one class of fix: **make the endpoint reachable from Cursor's
servers over public HTTPS**, and keep bearer-key auth on because the endpoint
becomes internet-reachable. Fix matrix, best-first:

| Option | Stable URL | Streaming | Friction | Notes |
| --- | --- | --- | --- | --- |
| cloudflared Quick Tunnel | No (rotates per restart) | Officially unsupported on quick tunnels (docs, 2026-04-20); works in practice for POST chat | Zero signup | Best first smoke test |
| cloudflared Named Tunnel | Yes | Supported | Free account + domain | Best daily driver |
| ngrok (free static dev domain) | Yes | Supported | Account + authtoken | Free caps: 1 GB/mo, 20k req/mo — agent traffic burns this fast |
| Tailscale Funnel | Yes | Should work — no primary Cursor success report found | Tailscale + policy | Only ports 443/8443/10000; TLS terminates on your machine (best tunnel-privacy) |
| VPS + reverse SSH + Caddy | Yes | Supported (Caddy streams by default) | Most moving parts | Only you and the VPS provider in the path |

### 5.1. Quick test: cloudflared Quick Tunnel

```bash
brew install cloudflared
cloudflared tunnel --url http://127.0.0.1:41434
# prints https://<random-words>.trycloudflare.com
```

In Cursor Settings → Models: enable Override OpenAI Base URL =
`https://<random-words>.trycloudflare.com/v1`, API key = the Local Motion
bearer key, keep the custom model `Local Motion`, select it explicitly, send a
real chat message.

Gotchas: hostname rotates every cloudflared restart (re-paste in Cursor each
session); anyone with the URL can reach the proxy, so bearer auth must stay
enforced; SSE is officially unsupported on quick tunnels — if streaming
arrives buffered, move to a named tunnel.

### 5.2. Daily driver: cloudflared Named Tunnel

Requires a free Cloudflare account and a domain on Cloudflare.

```bash
cloudflared tunnel login
cloudflared tunnel create local-motion
cloudflared tunnel route dns local-motion llm.yourdomain.com
# ingress config: llm.yourdomain.com -> http://127.0.0.1:41434
cloudflared tunnel run local-motion
```

Base URL: `https://llm.yourdomain.com/v1`. Stable across restarts; SSE
supported. Do **not** front it with Cloudflare Access Service Auth — Cursor's
backend can only send the OpenAI `Authorization: Bearer <session-key>` header;
that is the entire header budget. Rely on the origin bearer key.

### 5.3. Operational rules regardless of tunnel

- Use a strong random bearer key once the proxy is public; a guessable static
  key on a public URL is an open LLM endpoint.
- Toggle the base URL override off when switching back to Cursor's built-in
  models (global-override limitation, §2).
- Expect chat-only official support; treat Agent as best-effort (§2, §3).
- Kill the tunnel when done. The proxy should never be public longer than
  needed.

### 5.4. Privacy tradeoff — say it plainly

With any tunnel, every prompt and attached file transits **Cursor's backend
(prompt building) and the tunnel path**. BYOK also voids Cursor's ZDR policy.
"Fully local and private inside Cursor's native chat" is architecturally
impossible today; the honest claims are "local compute, Cursor-routed prompts"
for Cursor, and "fully local" only for the VS Code LM API path in real VS Code.

## 6. Anti-Patterns

- **Pasting `http://localhost:<port>` into Cursor per SEO'd 2026 tutorials.**
  A live class of AI-generated articles (thebizaihub.com, aitribune.net,
  compute-market.com, mljourney.com, Mar 2026 era) still instructs exactly
  this. It is contradicted by official docs, staff statements, and the
  reproducible 403.
- **Trusting the Verify button** as proof of end-to-end reachability.
- **localtunnel** (interstitial page requires a bypass header Cursor cannot
  send) and **bare bore.pub** (raw TCP, no TLS — Cursor rejects plain HTTP).
  Any tunnel that needs a custom client header is incompatible: Cursor sends
  only the bearer key.
- **Flipping HTTP Compatibility Mode to fix the 403.** Client-side setting;
  the block is server-side. It also risks degrading Tab/indexing.
- **Renaming the model to dodge the block.** Unrecognized names (e.g. `cus-`
  prefixes) only prevent model-name hijacking; requests still originate from
  Cursor's servers. Reverse-engineering write-ups claiming no-tunnel localhost
  Agent mode (dev.to, Apr 2026) are wrong as read — the author's own companion
  repo mandates an HTTPS tunnel ("Cursor requires HTTPS").
- **Writing Cursor private state** (SQLite `state.vscdb`) to force settings —
  unchanged product contract, see
  [Plan 001](../Plans/001-cursor-model-picker-setup-plan.md); and it would not
  change the routing architecture anyway.

## 7. Escalation Triggers

- Cursor ships direct/local BYOK routing or local-model support: watch
  [forum.cursor.com/t/when-will-cursor-fully-support-byok/164375](https://forum.cursor.com/t/when-will-cursor-fully-support-byok/164375)
  and the changelog. As of 2026-06-30 staff say backend routing is intentional
  with no change planned.
- Enterprise path: staff hinted at "enterprise-specific options" for private
  model endpoints (2026-01-29) — only resolvable via Cursor enterprise
  support.
- `cursor-agent` CLI routing is unverified (unknown whether it shares the
  backend SSRF block). A 5-minute local test would settle it. Notable
  datapoint: GitHub Copilot CLI *does* officially support localhost BYOK via
  `COPILOT_PROVIDER_BASE_URL`.
- If Cursor's backend request shape breaks the proxy in Agent mode, consider a
  `/cursor`-style normalization path (LiteLLM/OpenRouter precedent) rather
  than loosening the proxy's OpenAI compliance.
- Teams/Business "Model controls" (May 2026) may block BYOK org-wide with a
  different error than the 403 — unverified; check admin policy before
  debugging a managed user's setup.

## 8. Works Cited

- Official BYOK docs (backend routing, chat-only, ZDR carve-out):
  <https://cursor.com/help/models-and-usage/api-keys> (fetched 2026-07-01)
- Docs sitemap, no local-model surface: <https://cursor.com/llms.txt> (fetched
  2026-07-01)
- Staff: backend calls your endpoint; no localhost support (2026-01-20):
  <https://forum.cursor.com/t/using-local-model-with-cursor/149366>
- Staff: tunnel recommendation, ngrok/Cloudflare (2026-02-25):
  <https://forum.cursor.com/t/connecting-local-ai-server-to-cursor-does-not-work/152940>
- Staff: architectural limitation, prompt building server-side (2026-05-22):
  <https://forum.cursor.com/t/how-can-i-use-a-local-llm-on-my-desktop-ai-computer/152419>
- Exact 403 string, staff "not supported" (2025-04-14 / 2025-06-12):
  <https://forum.cursor.com/t/problem-accessing-models-through-internal-proxy/79166>
- Verify-button false positives (2024-12):
  <https://forum.cursor.com/t/openai-api-key-verified-but-shows-unable-to-reach-127-0-0-1/36835>
- Global override breaks built-in models:
  <https://forum.cursor.com/t/cursor-models-fail-when-using-byok-openai-key-with-overridden-base-url-glm-4-7/147218>
- Working tunnel recipe for the identical proxy shape:
  <https://github.com/ephraimduncan/codex-cursor>
- Quick Tunnel SSE limitation (modified 2026-04-20):
  <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/>
- ngrok free-plan limits: <https://ngrok.com/docs/pricing-limits/free-plan-limits>
- Tailscale Funnel constraints: <https://tailscale.com/docs/features/tailscale-funnel>
- LiteLLM `/cursor` normalization endpoint (Ask/Plan only, Dec 2025):
  <https://docs.litellm.ai/docs/tutorials/cursor_integration>
- OpenRouter Cursor integration (beta; Tab unaffected by BYOK):
  <https://openrouter.ai/docs/cookbook/coding-agents/cursor-integration>
- No `vscode.lm` in Cursor (staff, 2025-01-27 / 2026-02-21):
  <https://forum.cursor.com/t/vscode-lm-api-in-vscode-extensions/26563>,
  <https://forum.cursor.com/t/support-for-language-model-tools/152071>
- Enterprise Private Connectivity scope (source control only):
  <https://cursor.com/docs/enterprise/network-configuration>
- BYOK/no-change-planned staff statement (2026-06-30):
  <https://forum.cursor.com/t/when-will-cursor-fully-support-byok/164375>
