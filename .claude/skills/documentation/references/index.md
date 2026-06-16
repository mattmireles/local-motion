# Documentation References

Canonical docs for `documentation` in Local Motion:

- `README/Guides/vs-code-local-ai-hugging-face-guide.md` for extension-sidecar
  architecture, Cursor constraints, and local runtime assumptions.
- The source file being documented and its direct callers/callees.
- `README.md` for the current user-facing product path.

Useful comments should explain VS Code extension API boundaries, webview message
flow, local subprocess lifecycle, downloads, streaming, ports, and Cursor proxy
constraints when those details are not obvious from local code.
