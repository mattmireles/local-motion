# Tech Stack

- TypeScript VS Code extension targeting `engines.vscode` `^1.105.0`.
- Package manager: npm; repo currently has one root `package.json`, no workspaces.
- Build: `tsc -p ./`; output entry is `out/extension.js`.
- Lint: ESLint 9 + `typescript-eslint`, script `npm run lint` over `src/**/*.ts`.
- Test: Node test runner via `npm test`, which compiles first and runs `tests/*.test.mjs`.
- Packaging: `@vscode/vsce`, script `npm run package` (`vsce package --no-dependencies`).
- Runtime integration points: VS Code Extension API, VS Code Language Model Chat Provider contribution, macOS `llama-server`, Hugging Face GGUF repos, local OpenAI-compatible proxy for Cursor.