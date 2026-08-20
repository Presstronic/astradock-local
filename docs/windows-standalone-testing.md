# Windows standalone test builds

## Purpose and boundary

The Windows x64 standalone build lets an AstraDock maintainer copy the application to a known test machine and run it without an installer. It is a test artifact only. All AstraDock releases continue to use the artifacts approved by [ADR-0002](architecture/adr-0002-mvp-platform-packaging-and-update-policy.md); the standalone executable must not be published, attached to a GitHub Release, advertised to users, or used as installer qualification evidence by itself.

## Diagnostic log

Standalone Windows and Linux runs write a privacy-safe structured diagnostic log to Electron's per-user application-data directory:

- Windows: `%APPDATA%\\astradock-local\\logs\\astradock.log`
- Linux: `$XDG_CONFIG_HOME/astradock-local/logs/astradock.log` (normally `~/.config/astradock-local/logs/astradock.log`)

The logger records lifecycle, IPC failure, and startup/shutdown information only. It does not record raw game-log lines, credentials, account identifiers, or source paths. The active file is capped at 5 MiB with three rotated files (`astradock.log.1` through `.3`); files are owner-readable where the platform supports permissions. Include the log files when reporting a standalone test failure, after reviewing them for any locally meaningful metadata.

Electron Builder calls the underlying target `portable`. In AstraDock documentation and artifact names, use **standalone test artifact** to avoid implying that it is a supported portable release or that application data travels with the executable.

## Build

Install the locked dependencies and run:

```bash
npm ci
npm run dist:standalone:win
```

The command type-checks the project, builds the renderer, targets only Windows x64 `portable`, disables publication with `--publish never`, and writes output separately from release artifacts:

```text
dist/standalone/AstraDock-Local-<version>-standalone-test-x64.exe
```

A non-zero command result, absent executable, partial file, unexpected target, or differently named output is a failed build. Do not transfer or relabel it as a successful artifact. Building Windows binaries on a non-Windows host may require Electron Builder downloads and Wine; prefer the approved Windows packaging environment when those prerequisites are unavailable.

## Transfer and happy-path smoke test

Transfer the executable only through an approved private method to a supported Windows x64 test machine. Record the source commit, application version, artifact SHA-256 digest, build host, target OS version, and whether the artifact is signed.

1. Verify the transferred digest matches the build-host digest.
2. Launch it as the test user without administrator privileges.
3. Verify the application opens with no game installed or log available and reports the safe empty/awaiting-source state.
4. Exercise default source discovery and a trusted user-selected source using sanitized data.
5. Exercise monitoring, application restart, log append, log replacement, and offline operation.
6. Confirm no installer-created shortcut, registry integration, uninstall entry, update metadata, or automatic publication is expected.
7. Confirm application data is written to AstraDock's normal per-user Electron application-data location, not beside the executable.

The standalone smoke pass supplements the Windows installer regression in ADR-0002. It does not satisfy clean-install, upgrade, automatic-update, rollback, or uninstall acceptance criteria.

## Expected degraded and unhappy paths

- An unsigned prerelease artifact may produce Windows trust warnings. Record the result and use only owner-approved test distribution; do not disable or bypass operating-system protections as a workaround.
- Unsupported Windows versions and non-x64 architectures have no compatibility claim.
- Missing Star Citizen installations, inaccessible or moved logs, retained data from an earlier test, and offline operation must use the application's existing safe empty, error, and recovery behavior.
- A packaging failure must remain non-zero and must not leave an output that a maintainer could reasonably mistake for a valid artifact.
- Moving the executable does not move application data. A stale per-user data directory can therefore affect later test runs and must be recorded in test evidence.

## Cleanup and privacy

Close AstraDock and delete the standalone executable to remove the program artifact. This does **not** remove AstraDock settings, telemetry, caches, diagnostics, or other application data stored in the normal per-user application-data directory. Use the product's approved data-deletion workflow when available; until then, follow the exact application-data cleanup procedure established by the persistence and uninstall work rather than deleting broad parent directories.

Do not transfer real user logs, credentials, identifiers, IP addresses, private paths, or extracted game assets with the executable. Use sanitized fixtures. Treat artifact hashes and test results as release-style evidence, but keep them explicitly labeled as standalone test evidence.
