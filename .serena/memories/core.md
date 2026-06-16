# Core

- Local Motion is a single-package VS Code/Cursor extension.
- Primary source map: `src/extension.ts` activates commands/provider, `src/app/localMotionController.ts` orchestrates setup/runtime, `src/ui/setupPanel.ts` owns setup UI, `src/provider/localMotionProvider.ts` exposes VS Code Language Model API integration.
- Runtime sidecar path: `src/models/huggingFace.ts` + `src/models/compatibility.ts` for GGUF discovery/fit, `src/runtime/downloader.ts` for downloads, `src/runtime/llamaServerResolver.ts` + `src/runtime/llamaServer.ts` for binary/process lifecycle, `src/runtime/openAiProxy.ts` + `src/runtime/openAiStream.ts` + `src/runtime/openAiChat.ts` for Cursor/OpenAI-compatible traffic.
- Durable docs start at `README.md` and `README/Guides/vs-code-local-ai-hugging-face-guide.md`; plans live flat under `README/Plans/`.
- Read `mem:tech_stack` for commands/toolchain and `mem:task_completion` before closing coding tasks.