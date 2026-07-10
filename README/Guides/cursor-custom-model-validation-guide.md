# Cursor Custom-Model Validation Debugging Guide

July 9, 2026

Use this guide when Cursor lists a Local Motion model but rejects a chat with
`Model name is not valid`. The same message can describe a disabled BYOK
provider, a stale credential, or Cursor-side catalog validation. Do not rename
the model until the request path is measured.

## Related Documentation

- **[Cursor private-network block guide](cursor-private-network-block-guide.md)**:
  Why Cursor needs a public HTTPS tunnel and how to distinguish backend SSRF
  rejection from local runtime failures.
- **[Local native LLM extension guide](vs-code-local-ai-hugging-face-guide.md)**:
  Sidecar, proxy, provider, and Cursor handoff architecture.
- **[Cursor tunnel notes](../Notes/cursor-tunnel.md)**: Machine-specific
  incidents, regression tests, and verified fixes for the Local Motion handoff.

## 1. Proven Contract

The OpenAI API-key provider must be on. An enabled Base URL override is not
enough.

The working Cursor 3.10.20 setup, proven on 2026-07-09, was:

1. `Cursor Settings > Models > API Keys` expanded.
2. `OpenAI API Key` turned on with the current 64-character Local Motion
   session key.
3. `Override OpenAI Base URL` turned on with the current public HTTPS tunnel
   URL ending in `/v1`.
4. `Local Motion` present under `Add Custom Model` and selected in chat, not
   `Auto`.
5. A prompt submitted in Cursor chat returned the exact requested local-model
   response.

Cursor's official API-key documentation says to configure provider keys under
`Cursor Settings > Models` and that custom keys apply to standard chat models,
not specialized features such as Tab completion. It does not document a stable
extension API for custom-model registration or a contract for arbitrary model
identifiers.

### 1.1 What the live repro ruled out

The external research draft claimed Cursor categorically rejects spaces and
requires a `cus-` prefix. The live repro falsified that claim for Cursor
3.10.20: the exact identifier `Local Motion` succeeded without renaming after
the OpenAI API-key toggle was enabled.

Do not adopt `cus-local-motion`, `gpt-4o-mini`, or another compatibility alias
without a new measured failure in which:

- the OpenAI API-key toggle is on;
- the current key and tunnel URL are installed;
- the prompt still does not reach the proxy; and
- the alternative identifier is proven to make the same request succeed.

A catalog alias can collide with Cursor's built-in routing and break switching
back to cloud models. Renaming is therefore a last resort, not setup advice.

## 2. Why the Error Was Misdiagnosed

The model was correctly stored in Cursor:

```text
userAddedModels: ["Local Motion"]
modelOverrideEnabled: [..., "Local Motion"]
```

The Base URL was also present. The missing state was:

```text
useOpenAIKey: false
```

With the provider off, Cursor treated the selected name as a normal managed
catalog model and rejected it before Local Motion received a chat request.
Turning the provider on, installing the current session key, and selecting the
same model made the request work.

This matters because the visible settings can look almost complete:

- the key field says `Secret saved`;
- the Base URL override is green;
- the custom model appears in the picker; and
- only the small provider toggle remains off.

The setup must therefore say **turn on OpenAI API Key**, not merely “paste the
API key.”

## 3. Request Path

```text
Cursor chat
  -> Cursor model/provider validation
  -> Cursor backend prompt construction
  -> public HTTPS tunnel
  -> Local Motion loopback proxy
  -> llama-server
```

Each stage has a different failure fingerprint.

| Symptom | Request reached proxy? | Leading cause |
| --- | --- | --- |
| `Model name is not valid: "Local Motion"` | No | OpenAI provider off, stale Cursor state, or vendor catalog rejection |
| `Access to private networks is forbidden` | No | Base URL is loopback/private instead of public HTTPS |
| HTTP 401 | Yes | Cursor still has an old session key |
| HTTP 404 | Yes | Wrong `/v1` path or endpoint route |
| Local model starts generating | Yes | Validation, auth, tunnel, proxy, and llama-server all passed |

## 4. Diagnostic Sequence

Run the checks in order. Stop at the first failure.

### 4.1 Confirm the Local Motion session

The setup panel must show:

- `Local agent is on`;
- a non-empty Model name;
- a current session key;
- a public `https://.../v1` Base URL; and
- a live managed or manual tunnel.

Do not reuse values from a previous model start. Every restart mints a new
session key, and Quick Tunnel hostnames may rotate.

### 4.2 Confirm Cursor's provider state

In `Cursor Settings > Models > API Keys`:

1. Turn on `OpenAI API Key`.
2. Paste the current Local Motion session key.
3. Turn on `Override OpenAI Base URL`.
4. Paste the current public Base URL.
5. Add or retain the exact Model name shown by Local Motion.
6. Select that model in chat, not `Auto`.

`Secret saved` proves a value exists. It does not prove the provider toggle is
on.

### 4.3 Prove the endpoint separately

Use the current values from the same Local Motion session:

```bash
curl -sS \
  -H "Authorization: Bearer <current-session-key>" \
  "https://<current-tunnel-host>/v1/models"
```

Expected shape:

```json
{
  "object": "list",
  "data": [
    {
      "id": "Local Motion",
      "object": "model",
      "owned_by": "local-motion"
    }
  ]
}
```

This proves tunnel, auth, and model advertisement. It does not prove Cursor
will submit a chat.

### 4.4 Prove a real Cursor chat

Submit a deterministic prompt:

```text
Reply with exactly: LOCAL MOTION WORKS
```

Completion requires both:

- Cursor renders `LOCAL MOTION WORKS`; and
- Local Motion records the first authorized `POST /v1/chat/completions` or
  `llama-server` begins generation.

A green `GET /v1/models` alone is not the acceptance test.

## 5. Fresh Quick Tunnel DNS

Some home routers return NXDOMAIN for a new `*.trycloudflare.com` hostname even
after public DNS already resolves it. Cursor's backend may be able to use that
tunnel while the Mac's ordinary `fetch` fails locally.

Local Motion therefore uses the same fallback for both phases:

1. try the system resolver;
2. resolve an IPv4 address through public DNS-over-HTTPS after a network
   failure;
3. connect to that IP while preserving TLS SNI and the HTTP `Host` header; and
4. require the authenticated `/v1/models` response to include the active model.

Without step 2, the tunnel reachability probe can pass but the final setup copy
still fails with:

```text
fetch failed
Setup block was not copied because endpoint verification failed.
```

## 6. Anti-Patterns

| Anti-pattern | Why it fails | Do this instead |
| --- | --- | --- |
| Paste a key but leave its provider toggle off | Cursor rejects before proxy routing | Turn on OpenAI API Key explicitly |
| Rename the model immediately | Hides the real state bug and can collide with built-ins | Prove provider state and proxy traffic first |
| Treat `Secret saved` as enabled | Saved value and enabled provider are separate states | Check the toggle itself |
| Use `127.0.0.1` in Cursor | Cursor's backend cannot reach the Mac's loopback | Use the active public HTTPS tunnel |
| Trust `/v1/models` as full proof | It does not prove Cursor submitted chat | Require one rendered chat response |
| Verify a fresh tunnel only with system DNS | Router NXDOMAIN can be stale | Fall back to public DoH with SNI preserved |
| Write Cursor private SQLite state | Schema is unsupported and upgrade-fragile | Open settings and show exact values/actions |

## 7. Research Provenance and Corrections

The external Max research artifact is:

```text
/Users/mm/Documents/GitHub/llm-workflows/outputs/create-guide/
cursor-custom-byok-model-identifier-validation-for-openai-compatible-endpoints/
2026-07-09T21-47-00-836Z/raw-report.md
```

Context7 resolved the current official Cursor documentation corpus as
`/websites/cursor`. It confirmed the supported-provider and standard-chat scope,
but did not document Base URL override internals or a custom identifier grammar.
Those gaps are marked as vendor-unstable rather than filled with inference.

The following draft claims were not retained:

- spaces are categorically invalid;
- `cus-` is a required or supported bypass prefix;
- all arbitrary custom names are rejected; and
- a catalog alias is the recommended Local Motion path.

They lacked authoritative support and contradicted the live Cursor 3.10.20
acceptance test.

## Works Cited

1. [Cursor API Keys](https://docs.cursor.com/settings/api-keys) — supported
   provider setup and standard-chat limitation.
2. [Cursor staff: custom model validation](https://forum.cursor.com/t/custom-model-problems/149214/5)
   — confirms that some unknown names can be rejected before provider traffic.
3. [Cursor staff: local/custom Agent limitations](https://forum.cursor.com/t/model-name-is-not-valid-omlx/160377)
   — public-endpoint requirement and current support boundary.
4. [Cursor staff: Base URL override affects built-in models](https://forum.cursor.com/t/does-adding-a-custom-model-override-cursor-s-native-models/157521)
   — cloud-model collision risk while the override is enabled.
