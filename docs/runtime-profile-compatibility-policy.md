# Runtime extraction-profile compatibility policy

## Decision

Implemented by [#88](https://github.com/Presstronic/astradock-local/issues/88).

AstraDock extraction profiles are organized at the narrowest useful shared family, normally `major.minor` plus release channel/universe/branch (for example, `sc-4.9-live`). Patch builds may reuse that family only while evidence proves compatible vocabulary and semantics. A family name is not a claim that every `major.minor.*` build is automatically supported.

Compatibility is an evidence-backed allowlist with explicit exclusions and drift detection:

```text
profile family: major.minor + channel/universe + branch
tested builds: exact observed build strings/ranges with fixture evidence
excluded builds: known incompatible exact builds/ranges with reason
profile version: immutable revision of patterns and semantic decisions
compatibility result: compatible | unverified_build | unsupported_profile | suspected_drift
```

Profiles never cross a minor-version, release-channel, universe, or branch boundary implicitly. LIVE, PTU, EPTU, TECH-PREVIEW, and HOTFIX evidence stays partitioned even if two builds emit identical text.

## Selection rules

1. Detect environment and full build identity before semantic promotion when possible.
2. Select only a family whose major/minor, channel/universe, and branch constraints match.
3. Reject an explicit exclusion before considering tested-build compatibility.
4. Mark an exact tested build `compatible` with its fixture-backed profile revision.
5. A matching but untested patch build is `unverified_build`. It may continue bounded diagnostic capture and patterns explicitly declared patch-tolerant, but must not silently claim full semantic coverage.
6. Required-anchor failures, contradictory vocabulary, field-shape changes, or abnormal unknown-event rates move the session to `suspected_drift` and disable affected event families safely.
7. An unknown minor/channel/branch is `unsupported_profile`; it does not fall back to the nearest profile.

Profile schema version 2 implements this decision. The immutable `sc-4.9-live@2026-08-19.5` family accepts exact fixture-backed 4.9.0 synthetic builds and observed LIVE build `4.9.188.23497`. `4.9.999.0-BLOCKED-SYNTH` is the deterministic explicit-exclusion test case with reason `synthetic_known_incompatible_vocabulary`; it is not a claim about a real game build. Other matching 4.9 LIVE patches are `unverified_build`, and semantic event extraction is suppressed until exact fixture evidence is accepted.

`sc-4.9-cross-env` is marked fixture-only and can be selected only by an explicit test option. It exists to verify partition isolation and can never become an automatic PTU/EPTU/HOTFIX fallback in the application.

## Drift and observability

Compatibility is per event family as well as global. Extractor IDs define bounded families such as `identity`, `pu`, `connection`, `party`, `zone`, and `quantum`. A required-field shape failure marks only that family as drifting and suppresses later semantic emissions from it; unaffected families continue. A globally abnormal unknown ratio remains a global suspicion because unmatched records cannot be attributed safely. Diagnostics expose:

- detected channel, branch, full build, and selected profile/version;
- exact compatibility result and reason;
- tested-build/exclusion basis;
- required anchors seen/missing;
- affected event families and bounded unknown counts; and
- last compatible observation time.

Drift must never reinterpret historical events. Profile revisions are immutable for replay, and previously persisted events retain the profile version that emitted them.

## Star Citizen release lifecycle

Star Citizen game version/build identity is the compatibility dimension. AstraDock application version is not part of profile identity and does not create a backward-compatibility promise for older AstraDock releases. The MVP catalog must explicitly cover every known Star Citizen version in scope, including its active `Game.log` and applicable backup `Game.log` files. Future releases are added only after their log evidence is captured and reviewed; unknown releases are not automatically supported.

Profile selection is per file, not per user-selected source set. The selected AstraDock environment supplies source context and user intent, while each active or backup file supplies its own Star Citizen build identity. A source-set operation may therefore combine files from multiple supported Star Citizen versions, such as 4.9.x and 4.10.x, provided every file is independently classified and parsed with its matching profile. No file may inherit the profile selected for a different file merely because both belong to the same environment or backup directory.

The catalog may contain selected historical, current, and provisional future Star Citizen profiles. A new Star Citizen release receives a separate profile family or immutable revision when evidence shows changed semantics; it must not inherit a nearby release automatically. If a referenced historical revision is unavailable, replay reports `profile_unavailable` and preserves the event metadata rather than substituting another Star Citizen release's profile.

The application also maintains a separate observed-build registry. The registry records exact build numbers found in owner-supplied log files even when no runtime event profile or capability has been evaluated for that build. This prevents build identity from being lost while allowing capability support to advance independently. The Compatibility workspace exposes both layers: registered builds and per-capability status. As of the current corpus, 44 builds and 437 log files are registered; blueprint extraction is the only evaluated capability, and its exact-build allowlist remains narrower than the registry.

## PTU 4.10 capture policy

The owner's PTU/TEST access is an opportunity to detect drift before release, not permission to treat PTU as LIVE evidence. Current 4.10 PTU builds remain `unsupported_profile` and cannot fall back to 4.9 LIVE. After annotated captures are supplied, create a provisional `sc-4.10-ptu` family with exact PTU builds and sanitized positive/negative fixtures. The capture sequence is: record exact build/channel/branch, retain raw logs locally, minimize and sanitize action-specific excerpts, declare exact builds and anchors, pass privacy/isolation replay, then approve semantic families. When 4.10 reaches LIVE, validate it in a separate `sc-4.10-live` family even if it appears textually identical to PTU.

## Failure and recovery behavior

- Unsupported/unverified profiles do not crash monitoring or discard source bytes.
- Affected current-state instruments show `unsupported` or `unknown`, not stale values from another profile.
- Compatible unaffected families may continue when family-level drift isolation is safe.
- Recovery requires selecting a compatible profile revision or explicitly approved build evidence; elapsed time alone cannot restore compatibility.
- Diagnostic evidence remains local, bounded, inspectable, and excluded from Station synchronization by default.

## Verification guidance

Happy path:

1. Select the same `sc-4.9-live` family for two explicitly tested 4.9 patch builds and retain their exact build identities.
2. Verify fixtures for each build emit only the event families proven for that build/profile revision.
3. Confirm replay uses the stored immutable profile version.

Unhappy path:

1. Present an untested 4.9 patch, explicit exclusion, 4.10 build, or PTU build and verify the appropriate non-compatible state without fallback.
2. Remove a required ready anchor or change notification field shape and verify family-level `suspected_drift` plus safe event suppression.
3. Interleave identical records from LIVE and PTU and verify no cross-environment profile selection, correlation, or projection.
4. Verify diagnostics and exports redact source paths, endpoints, identifiers, and raw records.

## Technology and libraries

None. This policy extends the existing profile metadata, parser-health diagnostics, sanitized fixtures, and built-in test infrastructure.
