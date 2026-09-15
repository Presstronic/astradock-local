# MVP requirement-to-evidence traceability

This matrix audits the settled MVP boundary in [`product-requirements.md`](product-requirements.md). `Proven` means current code and focused automated evidence directly support the requirement. `Partial` means useful implementation exists but the release evidence or end-to-end qualification is incomplete. `Blocked` means an open release dependency prevents a readiness pass. No row is promoted to proven from the absence of a failing test.

| PRD requirement | Current evidence | Status | Release gap / owner action |
| --- | --- | --- | --- |
| 6.1 source discovery | `src/sourceDiscovery.js`; `sourceDiscovery.test.js`; user guide | Proven for tested layouts | Run packaged clean-install matrix (#45) |
| 6.2 incremental monitoring | `src/runtimeLogTailer.js`; `runtimeLogTailer.test.js`; tailer docs | Proven in unit/replay coverage | Qualify packaged long-running workloads (#48) |
| 6.3 profile extraction | runtime profile/parser tests and sanitized fixture corpus | Proven for reviewed profiles | New builds still require evidence and profile review |
| 6.4 cheap recognition | parser engine dispatch implementation and benchmarks | Proven in code/benchmark coverage | Capture release benchmark record (#48) |
| 6.5 unknown evidence | unknown evidence store, privacy tests, retention tests | Proven locally | Support export and operational workflow remain open (#47) |
| 7 canonical envelope/provenance | `runtimeEvents` contracts, validation, persistence tests | Proven in contract tests | No packaged end-to-end evidence record |
| 7.3 uncertainty and 7.6 isolation | projections, environment fixtures, store/replay tests | Proven in automated coverage | Manual packaged recovery still required (#48) |
| 8.1 client/lifecycle | parser/profile fixtures and lifecycle projection tests | Partial | Evidence coverage is not a complete release qualification |
| 8.2 shard/server/session | lifecycle, transition, and instrument tests/docs | Partial | Unsupported transition cases remain explicitly unknown (#70) |
| 8.3 party | party fixtures, projection tests, monitor docs | Partial | Accessibility and packaged interaction qualification (#46) |
| 8.4–8.5 mission/location/destination/vehicle | evidence matrices and negative/positive tests | Partial | Provisional/candidate capabilities must remain bounded; more evidence is open |
| 9 persistence/replay | encrypted canonical store, migrations, replay and deletion tests | Proven in unit coverage | Packaged upgrade/recovery qualification (#45, #48) |
| 10 rules/assertions | PRD says user-authored rules are excluded; no MVP surface | Proven non-goal | Do not advertise rule authoring |
| 11 Station synchronization | no authentication/network/sync surface in MVP | Proven non-goal | Future phase; no remote readiness claim |
| 12 installed-data mining | no mining surface in MVP | Proven non-goal | Future phase; no extraction claim |
| 13 security/privacy | Electron boundary, encrypted store, privacy docs, CI audit, security review | Partial | Security review does not replace signing/update qualification (#45, #50) |
| 14 performance/reliability | ADR targets, benchmarks, tailer/store tests | Partial | Full load, recovery, and soak qualification open (#48) |
| 15 UX/workspaces/stream/drilldown | React implementation, renderer tests, design/interaction docs | Partial | Cross-platform accessibility qualification open (#46); no release screenshots/recording |
| 16 packaging/platform | ADR and package targets; Linux CI build | Partial | Installer/update/signing and supported-platform evidence open (#45, #50) |
| 17 evidence/fixtures | sanitized corpus manifests and fixture tests | Proven for committed corpus | Owner captures and future profile drift remain open |

## Non-goal audit

The implementation and claims were checked for the explicit MVP exclusions: no Station network workflow, no default raw-log upload, no full game-database mining, no user-authored rule editor, no analytics workspace, and no unsupported telemetry promoted as fact. The focused blueprint exporter exists as a local testing workflow and is documented separately; it does not expand the Runtime Monitor MVP boundary.

## Interpretation

This matrix proves a strong implementation foundation, not release go-ahead. The partial rows are release blockers until the linked qualification issues provide authoritative packaged, accessibility, performance, signing, and support evidence.
