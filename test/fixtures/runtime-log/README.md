# Runtime Log Fixtures

This directory contains sanitized Star Citizen `game.log` fixture snippets and manifests.

Rules:

- Every `.log` fixture must have a sibling `.manifest.json`.
- Use obvious synthetic placeholders only.
- Do not commit full logs, real handles, IDs, IPs, paths, credentials, service URLs, or extracted game assets.
- Keep promoted expected canonical events aligned with `runtime-event/v1`; unpromoted candidate names remain evidence notes only.
- Run `npm test` before committing fixture changes.

See `docs/runtime-log-fixture-corpus.md` for the full naming, manifest, sanitization, and review standard.
