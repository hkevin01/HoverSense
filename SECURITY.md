# Security Policy

## Supported Versions

HoverSense is a client-side educational simulator. There is no server component, no authentication system, and no user data storage. Security concerns are therefore limited to the client-side code and the development tooling.

| Version | Supported |
|---------|-----------|
| latest (main) | ✅ |

## Threat Model

Because HoverSense:
- Makes **zero network requests** during operation
- Stores **no data** beyond the in-memory session (cleared on refresh)
- Has **no authentication or authorization** layer
- Is a **static HTML/JS application** with no build pipeline by default

...the attack surface is minimal. However, the following concerns are in scope:

- **Supply chain attacks** via `npx` dev server commands (pinned in `package.json`)
- **XSS in the dashboard** if user-controlled content is ever reflected into innerHTML
- **Prototype pollution** in the event bus or helper utilities
- **Dependency vulnerabilities** if external packages are added

## Reporting a Vulnerability

If you discover a security issue, please **do not open a public GitHub issue**. Instead:

1. Email a description to the maintainer (see package.json `author` field)
2. Include: description, reproduction steps, potential impact, and any suggested fix
3. You will receive an acknowledgment within 72 hours

We will coordinate a fix and disclosure timeline with you. Public disclosure before a fix is available is not permitted without explicit maintainer approval.

## Security Non-Issues

The following are **intentional design decisions**, not vulnerabilities:

- HoverSense *demonstrates* behavioral profiling techniques — this is its stated educational purpose
- The ML model weights are hardcoded and public — they are synthetic/illustrative, not trained on real user data
- The heatmap canvas is accessible to page JavaScript — there is no sensitive data in it
