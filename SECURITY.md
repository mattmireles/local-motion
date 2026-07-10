# Security Policy

Local Motion is local-first, but its optional Cursor handoff uses a public
tunnel and a temporary session key. Treat either one as sensitive while the
tunnel is running.

## Report a Vulnerability Privately

Do not open a public issue for a suspected vulnerability, leaked credential, or
privacy flaw. Use GitHub's **Report a vulnerability** flow on the repository's
[Security advisories page](https://github.com/mattmireles/local-motion/security/advisories).

Include the affected version, a minimal reproduction, realistic impact, and any
mitigation you have found. Remove private prompts, source code, session keys,
and model output from the report unless they are essential to reproduce the
issue.

We will acknowledge a valid report within seven days, share progress when we
can reproduce it, and publish a fix or mitigation once users can act on it.
