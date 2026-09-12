# Blueprint extraction contract

The blueprint exporter has a versioned, profile-gated extraction boundary. A profile is enabled only when an owner-approved evidence record supplies its identifier, version, exact notification labels, and compatible build scope. The repository currently has no enabled production profile because [the evidence matrix](blueprint-exporter-evidence-matrix.md) remains unapproved.

## Recognition

The parser recognizes only an approved `Added notification` anchor and the exact label set supplied by that profile. Generic `Received Blueprint` text, inventory initialization, attachment events, reward assets, update echoes, and follow-up-only lines are not records. A profile that is missing, empty, or build-incompatible returns `unsupported` with bounded diagnostics and zero export records.

## Normalization and identity

The Station payload remains exactly an array of `{ name, type, shared }` objects. `name` is the trimmed observed display value. `type` is empty unless a profile supplies a direct, approved value; it is never inferred from item-name keywords. `shared` is `true`, `false`, or `null` only when the profile supplies an approved value. Records are identified by Unicode-normalized, case-insensitive name and emitted in stable name order.

The local scan result retains provenance separately from the payload: source filename and kind, source timestamp, detected build, parser version, profile identifier, confidence, and the number of suppressed duplicate observations. Raw log lines are not returned in the renderer result or written to the Station-shaped JSON.

## Outcomes

- `approved`: at least one scanned file matches the active evidence profile.
- `unsupported`: no profile is enabled, the build is outside profile scope, or no scanned file is compatible.
- `no_matches`: an approved profile was usable but found no qualifying notification.
- `partial`: an approved scan produced records while one or more source inputs changed or failed.

The extraction result is local diagnostic metadata. It does not authorize Station synchronization or claim that a community-reported pattern is official game telemetry.

## Verification

The contract is covered by `test/blueprintExporter.test.js`: missing profiles, incomplete profiles, build mismatch, accepted notification parsing, localized profile labels, duplicate suppression, deterministic output, malformed source names, source changes, and atomic JSON writing. Synthetic approved profiles in tests are deliberately marked as test-only; they do not enable production recognition.
