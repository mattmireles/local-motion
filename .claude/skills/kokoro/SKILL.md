---
name: kokoro
description: >-
  Implements and debugs Kokoro TTS in Gist: client-side Kokoro-82M/kokoro-js
  in browsers and Chrome MV3 extensions, plus the native Swift/CoreML Kokoro
  server worker backed by the sibling kokoro-coreml and web-scraper repos. Use
  when the task mentions Kokoro, kokoro-js, Kokoro-82M, reader audio synthesis,
  CoreML TTS, native Kokoro workers, or Apple Silicon TTS fleet behavior. Do
  not use for non-Kokoro vendor TTS or generic extension bugs with no TTS
  component.
---

# Kokoro

## Canonical guides

For browser, web share, and Chrome extension Kokoro paths, read this first:

[Kokoro TTS in the Browser and Chrome Extensions (MV3)](../../../README/Guides/Kokoro-TTS-browser-guide.md)

In the repo root, the path is `README/Guides/Kokoro-TTS-browser-guide.md`.

For **mobile Web Audio playback** after synthesis (iOS mute switch, autoplay
unlock, Bluetooth sample-rate drift, Android Media Session), read:

[Mobile web audio: iOS Safari and Android Chrome](../../../README/Guides/frontend/Mobile-web-audio-guide.md)

In the repo root, the path is `README/Guides/frontend/Mobile-web-audio-guide.md`.

For native/server Kokoro, also inspect the sibling repos before changing
production behavior:

- `/Users/mm/Documents/GitHub/kokoro-coreml/README.md` — production Swift/CoreML Config F architecture, model inventory, and benchmark claims.
- `/Users/mm/Documents/GitHub/kokoro-coreml/README/Notes/kokoro-runtime-boundary.md` — native worker runtime bundle contract consumed by `web-scraper`.
- `/Users/mm/Documents/GitHub/kokoro-coreml/README/Notes/bakeoff-results-v2.md` — current cross-machine Config F performance evidence.
- `/Users/mm/Documents/GitHub/kokoro-coreml/README/Guides/apple-silicon/CoreML-Compute-Unit-Scheduling-guide.md` — Apple Silicon/CoreML scheduling, fallback, and verification guidance.
- `/Users/mm/Documents/GitHub/kokoro-coreml/README/Guides/apple-silicon/CoreML-LSTM-Enumerated-Shapes.md` — duration/LSTM fixed-shape and padding tradeoffs.
- `/Users/mm/Documents/GitHub/web-scraper/README/notes/kokoro-throughput-interventions.md` — production worker fleet throughput history and concurrency constraints.
- `/Users/mm/Documents/GitHub/web-scraper/README/Notes/kokoro-debug-notes.md` — current operational debugging notes for the TTS queue and native worker.

## Use when

- Integrating or updating **kokoro-js** / Kokoro-82M in web or extension code.
- Choosing **WebGPU vs WASM**, dtype (q8, fp32, etc.), or fallbacks for bad GPU output.
- Offloading synthesis to **Web Workers**, transferable buffers, or streaming to **Web Audio**.
- MV3 concerns: **CSP**, **service worker** vs page context, model **caching**, message passing to workers.
- Debugging native Kokoro server TTS, Swift/CoreML model loading, Apple Silicon
  compute-unit behavior, duration model selection, CoreML cache stalls, queue
  throughput, or worker fleet memory pressure.

## Do not use when

- Server-side or third-party TTS with no Kokoro path.
- Product audio that is **not** Kokoro (route to the right provider or frontend audio guide instead).
- Pure MV3 lifecycle or overlay bugs **without** Kokoro inference or asset loading (use chrome-extension-debug / extension-architecture as appropriate).

## Procedure

1. Classify the path first: browser/extension Kokoro, web-share playback, native
   Swift/CoreML worker, or queue/fleet operations.
2. For browser/extension paths, open the Gist browser guide and locate the
   relevant section (execution providers, workers, extension packaging, known
   WebGPU anomalies).
3. For native worker paths, open `kokoro-coreml/README.md` and the runtime
   boundary note before changing model selection, compute units, warmup,
   chunking, or concurrency. Treat the Kokoro CoreML README as the source of
   truth for production Config F unless live evidence disproves it.
4. Cross-check linked docs from the guide’s “See also” when the bug involves
   **tabs, workers, service workers, CoreML caches, Apple Silicon scheduling,
   or worker fleet state**. For **iOS/Android listen playback** (silent after
   tap, hardware mute, lock-screen controls, background suspend), also open the
   mobile web audio guide above.
5. Prefer documented mitigations before inventing new stacks. Examples:
   **wasm + q8** for problematic browser GPUs; fixed padded duration buckets
   for native production; worker-level memory/concurrency limits for CoreML
   pressure.
6. After a non-trivial fix, ensure any new constraints are reflected in code
   comments or a short note in the relevant guide/notes file.
