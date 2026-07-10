# Contributing to Local Motion

Local Motion has one job: make a capable local coding model easy to run, then
get out of the way. Small, well-proved improvements are welcome.

## Before You Open a Pull Request

1. Open an issue first for a large change, new dependency, or product decision.
2. Keep the change narrow. Prefer deleting a special case over adding another
   setting or layer.
3. Add a regression test for every bug fix that can be tested.
4. Run the release gate:

   ```bash
   npm run check
   npm run lint
   npm test
   npm run package
   ```

## Good Bug Reports

State what you expected, what happened, and the smallest repeatable setup.
For setup failures, include your macOS version and chip, VS Code or Cursor
version, Local Motion version, GGUF repository and quantization, and the exact
error message.

Please remove private code, prompts, model output, session keys, and other
credentials before posting. Security reports belong in [SECURITY.md](SECURITY.md),
not a public issue.
