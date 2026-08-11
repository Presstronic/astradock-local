# Runtime Log Fixtures

This directory contains sanitized Star Citizen `game.log` fixture snippets and manifests.

Rules:

- Every `.log` fixture must have a sibling `.manifest.json`.
- Use obvious synthetic placeholders only.
- Do not commit full logs, real handles, IDs, IPs, paths, credentials, service URLs, or extracted game assets.
- Keep expected canonical events provisional until the runtime event contract is finalized.
- Run `npm test` before committing fixture changes.

See `docs/runtime-log-fixture-corpus.md` for the full naming, manifest, sanitization, and review standard.
