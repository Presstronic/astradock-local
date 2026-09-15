# AstraDock Local v0.1.0 release notes

**Status: draft / not a release announcement.** These notes describe the intended scope and current limitations; they must not be published as a release until [`release-readiness-audit.md`](release-readiness-audit.md) changes to GO through owner review.

## Included foundation

- Local Star Citizen source discovery and validated environment selection.
- Incremental runtime log tailing with framing, rotation, replacement, backpressure, and replay support.
- Versioned, privacy-aware canonical runtime events and current-state projections.
- Local encrypted persistence, retention, scoped deletion, and restart recovery.
- Runtime Monitor Terminal/Table stream, bounded drilldown, freshness, provenance, and uncertainty states.
- Sandboxed, context-isolated Electron renderer with validated capability IPC.
- Sanitized fixture-driven tests and local diagnostics.

## Explicitly not included

- Station authentication, synchronization, upload, or collaboration.
- Installed game-data mining or full database extraction.
- Background/service monitoring, analytics, user-authored rules, or unsupported event families.
- A production-signed installer, completed update/rollback validation, support export, or full platform/accessibility/soak qualification.

## Compatibility and privacy

Windows x64 is the primary intended workload and Linux x86_64 is documented through ADR-0002, but the current repository is experimental. Raw logs remain local by default; users must review any manually shared diagnostic or export file. Environment/build support is evidence-backed and unknown states are preserved rather than guessed.

## Verification snapshot

The current baseline passes automated tests, security surface review, production dependency audit, and GitHub CI checks recorded in the issue-44 PR. Packaging and release qualification remain open gates.
