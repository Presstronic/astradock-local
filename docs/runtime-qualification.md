# Runtime performance and reliability qualification

Issue #48 adds a repeatable qualification boundary for the MVP Runtime Monitor. The executable harness is [`scripts/qualifyRuntime.js`](../scripts/qualifyRuntime.js) and is intentionally dependency-free beyond the production parser, tailer, encrypted store, and existing renderer model.

Run the deterministic qualification with:

```sh
npm run qualify:runtime
```

Pass a path to retain a JSON result artifact. The artifact contains the application version, source commit when available, runtime, platform, workload-generator revision, targets, metrics, and individual checks:

```sh
npm run qualify:runtime -- /tmp/astradock-runtime-qualification.json
```

The harness covers:

- 5,000-line mixed recognized/unknown parser input with deliberately uneven chunk boundaries and selective extractor dispatch.
- Sustained and burst-style tailer appends with exact byte delivery, backlog drain, latency, and process-memory checks.
- Partial-line completion, truncation, replacement, generation changes, and resumed monitoring.
- Encrypted canonical-store append, paging, replay timing, duplicate collapse, and database-size checks.
- Renderer stream-window boundedness.

The harness uses synthetic placeholders only. It never reads a user's Star Citizen log, writes a persistent application database, or stores raw telemetry in the repository.

## Current automated evidence

The qualification run recorded on 2026-09-15 in the shared Linux x64 development environment passed all five scenarios. Representative results were:

| Scenario | Result | Evidence |
| --- | --- | --- |
| Parser mixed workload | Pass | 5,000 records; 50 canonical events; 248 ms; no error diagnostics |
| Tailer steady/burst | Pass | 10,200 lines including a 10-second burst; exact 610,500-byte delivery; p95 0.63 ms; zero backlog |
| Tailer recovery | Pass | Partial completion, truncation, replacement; generation advanced to 3; monitoring resumed |
| Store append/query/replay/dedup | Pass | 1,000 events; 1,000 duplicates collapsed; 13 ms replay query; 4.97 MiB database |
| Renderer bounded window | Pass | Shared stream model slices to the configured window |

`npm test` also passes, including the regression test that invokes the qualification harness with a short deterministic workload. Benchmark output is environment-specific and is evidence of the tested build only.

## Release-gate boundary

The automated run is not a substitute for packaged release qualification. A release reviewer must execute the same harness and the packaged application on the ADR-0004 representative Windows x64 baseline (or record an approved equivalent), including the 10-second 1,000-line/s burst, renderer-visible/hidden runs, CPU sampling, 250 MB total working-set check, startup/replay/shutdown timings, disk-full and permission simulations, renderer/runtime restart, and four-hour soak. Those results must be attached to the release record before v0.1.0 is called release-ready.

No private logs, account identifiers, paths, IP addresses, credentials, or extracted game assets belong in a result artifact. Failed cases are release blockers until fixed or documented as reviewed exceptions with a follow-up issue, as required by ADR-0004.
