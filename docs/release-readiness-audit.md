# v0.1.0 release-readiness audit

Audit date: 2026-09-15. Scope: AstraDock Local MVP and the live GitHub repository state. This is a go/no-go record for issue #44, not a marketing release announcement.

## Decision

**NO-GO for v0.1.0 release.** The local implementation and CI baseline are healthy, but the release gate is not complete. Open milestone work still covers packaging and update validation (#45), accessibility (#46), privacy-aware support export (#47), performance/recovery/soak qualification (#48), and Windows signing (#50). Issue #44 itself remains open.

## Strong evidence currently available

- Latest `main` includes the validated Electron boundary, local encrypted persistence, source validation, incremental tailing, event contracts, projections, and renderer tests.
- `npm test` passes locally: typecheck, 185 Node tests, and 76 renderer tests.
- `npm run security:check` passes.
- `npm audit --omit=dev --audit-level=high` reports 0 production vulnerabilities when registry access is available.
- GitHub CI for PR #163 passed Ubuntu tests, Windows tests, and Linux build.
- Sanitized fixture and negative-path tests cover environment isolation, privacy minimization, parser drift, deletion, replay, and unsupported evidence.

## Release gates

| Gate | Evidence | Decision |
| --- | --- | --- |
| User install/source/monitor/troubleshooting/uninstall docs | [`user-guide.md`](user-guide.md), ADR-0002 | Partial: packaged clean-system walkthrough pending |
| MVP requirement traceability | [`mvp-requirement-traceability.md`](mvp-requirement-traceability.md) | Partial: release qualification rows remain open |
| Security/privacy | [`security-threat-model.md`](security-threat-model.md), tests, audit | Pass for current local boundary; not a signing/update approval |
| Accessibility | Issue #46 | Blocked: qualification open |
| Performance/reliability/soak | Issue #48, ADR-0004 | Blocked: qualification open |
| Installers/artifacts/update/recovery | Issue #45, ADR-0002, release-candidate workflow | Partial: reproducible candidate packaging is implemented; lifecycle qualification remains open |
| Windows signing/provenance | Issue #50, ADR-0002 | Blocked: signing not acquired |
| Support diagnostics export | Issue #47 | Blocked: workflow open |
| Build artifacts | Linux CI build; local build may require artifact network | Partial: Windows installer and complete release matrix pending |
| Project/milestone metadata | Milestone 1 has 50 closed and 9 open issues; Project 7 is private, has 79 items and 14 fields; issue #44 is In Progress | Blocked: hierarchy/readme and release metadata are not complete |

## Open risks and dependencies

- A green unit/CI run does not prove four-hour soak behavior, native dialogs, update recovery, or accessibility on supported systems.
- Electron/Chromium security depends on maintained versions and artifact provenance; production signing and update verification are not complete.
- The product requirements document remains a working draft, so product-owner confirmation is required before converting candidate/provisional telemetry into release claims.
- Issue #67 tracks deferred test coverage and is open; issue #101 tracks an unimplemented evidence family and is open.
- Owner-provided captures, design qualification, supported-platform access, and signing credentials are external dependencies.

## Go/no-go checklist

Before release, the owner/release reviewer must:

1. Close or explicitly defer every release-blocking milestone issue with evidence.
2. Complete the Windows and Linux install, update, rollback, uninstall, and data-retention matrix.
3. Complete accessibility and reduced-motion qualification at supported sizes.
4. Complete performance, recovery, and four-hour soak qualification against ADR-0004.
5. Acquire and verify artifact signing/provenance for the intended distribution channel.
6. Review the requirement matrix and confirm candidate/provisional telemetry claims.
7. Verify Project 7, milestone 1, epic #19, parent/child links, statuses, and release metadata.
8. Approve release notes and explicitly authorize publication.

No publication, merge, or issue closure is implied by this audit.
