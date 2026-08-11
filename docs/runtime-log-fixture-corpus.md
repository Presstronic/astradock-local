# Runtime Log Fixture Corpus and Sanitization Standard

## Status and Purpose

| Field | Value |
| --- | --- |
| Status | Accepted fixture foundation |
| Decision issue | [#8](https://github.com/Presstronic/astradock-local/issues/8) |
| Applies to | Runtime `game.log` fixtures, manifests, validation tests, and future extraction-profile work |
| Current corpus | `test/fixtures/runtime-log/` |

This document defines how AstraDock Local stores sanitized Star Citizen `game.log` fixtures. The corpus is evidence for parser/profile work; it is not product telemetry, not a raw-log archive, and not permission to infer unsupported events.

The current snippets are small synthetic/sanitized excerpts derived from the reviewed 4.9 LIVE/PUB evidence in [`game-log-pattern-analysis-2026-08-09.md`](game-log-pattern-analysis-2026-08-09.md). They intentionally preserve sequence, marker, and correlation structure while replacing sensitive values.

## Directory and Naming Contract

Fixtures live under:

```text
test/fixtures/runtime-log/{channel}/{build-family}/{profile}/{domain}/{action}.{outcome}.log
test/fixtures/runtime-log/{channel}/{build-family}/{profile}/{domain}/{action}.{outcome}.manifest.json
```

Use lowercase path segments:

- `channel`: `live`, `ptu`, `eptu`, `hotfix`, `unknown`, or `multi`.
- `build-family`: a coarse family such as `4.9-pub`; do not encode private changelists in paths.
- `profile`: extraction-profile identifier such as `sc-4.9-live`.
- `domain`: `spine`, `party`, `zone`, `negative`, `framing`, `environment`, or another approved event family.
- `action`: concise kebab-case player or system action.
- `outcome`: `observed`, `non-event`, `framing`, `isolation`, or `unavailable`.

Every `.log` fixture has a sibling `.manifest.json` with the same basename. A manifest may omit `logFile` only for an unavailable evidence annotation where no safe snippet exists.

## Manifest Contract

Each manifest must record:

- `fixtureVersion`: current value `1`.
- `fixtureId`: repository-relative fixture identity without extension.
- `title`: short human summary.
- `releaseChannel`, `gameBuild`, `sourceProfileId`, and `sourceProfileVersion`.
- `domain`, `action`, and `outcome`.
- `provenance`: `sanitized_from_reviewed_private_log`, `synthetic_edge_case`, or `unavailable_evidence_annotation`.
- `evidenceBasis`: document or issue reference explaining why the fixture exists.
- `logFile` when a snippet is present.
- `privacyClassification` and `sensitivityHandling`.
- `expectedCanonicalEvents` for positive fixtures.
- `expectedNonEvents` for negative/unavailable fixtures.
- `correlation` and `knownLimitations`.
- `verificationNotes` explaining how future parser tests should use the fixture.

Canonical event payloads remain provisional until issue #12 finalizes event contracts. Manifests therefore name expected event types, confidence, provenance, required payload fields, and synthetic payload examples without freezing final schema details.

## Sanitization Protocol

Keep a private original only outside the repository. Before committing a snippet:

1. Reduce the sample to the smallest line sequence that proves or disproves the behavior.
2. Replace every player handle, account ID, character GEID, player GEID, node ID, session ID, login ID, trace ID, endpoint, local path, token, service URL, hardware identifier, and other private value.
3. Preserve correlation by using the same synthetic placeholder for the same original value within one fixture.
4. Use obvious values such as `SYNTH_HANDLE_LOCAL`, `SYNTH_ACCOUNT_LOCAL`, `SYNTH_NODE_PU`, and `game-server-alpha.example.invalid`.
5. Avoid numeric account-looking identifiers, UUIDs, long hexadecimal strings, JWT-looking strings, real IP addresses, real Windows or Unix user paths, and real Star Citizen installation paths.
6. Do not include full logs, game assets, screenshots of private data, or extracted copyrighted records.
7. Run `npm test`; the fixture validator rejects common secret/PII patterns and malformed manifests.

Do not over-sanitize away structure. If two records share a session, endpoint, node, request, mission, or notification correlation value, use one repeated synthetic placeholder instead of replacing every occurrence with unrelated text.

## Human Review Checklist

Before approving a fixture PR, verify:

- The manifest explains the player/system action and expected outcome without private raw-line numbers.
- The snippet is minimal and not a disguised full log.
- Every sensitive value is synthetic or redacted.
- Positive fixtures declare expected canonical events and required fields.
- Negative fixtures declare the tempting false-positive event types that must not be emitted.
- Unavailable annotations clearly state what was not captured and what evidence is still required.
- Environment/build/profile identity is explicit and cannot cross partitions.
- Multi-line, duplicate, partial-line, truncation, rotation, and line-ending behavior is represented where relevant.
- Unsupported telemetry is marked unproven instead of represented by fabricated positive events.

## Current Corpus Coverage

| Area | Fixture coverage |
| --- | --- |
| Build/environment | `spine/client-build-environment.observed` |
| Local identity/login | `spine/local-identity-login.observed` |
| PU join/shard/server | `spine/pu-join-shard-server.observed` |
| Party creation/launch/member connection | `party/party-create-launch-member-connected.observed` |
| Mission lifecycle gaps | `mission/mission-lifecycle-transitions.unavailable`; see [`mission-lifecycle-evidence-matrix.md`](mission-lifecycle-evidence-matrix.md) |
| Mission subsystem guards | `mission/mission-service-startup.non-event`, `mission/mission-giver-asset-failure.non-event`, `mission/tutorial-step-lifecycle.non-event` |
| Jurisdiction/monitored-space/armistice | `zone/jurisdiction-monitored-armistice.observed` |
| Disconnect/frontend return/clean quit | `spine/disconnect-frontend-clean-exit.observed` |
| Failure and transition gaps | `spine/failure-transition-evidence.unavailable` |
| Attractive non-authoritative lines | `negative/object-container-ship-navigation.non-event`, `negative/mission-notification-ui-lifecycle.non-event` |
| Framing and duplicate behavior | `framing/line-framing-edge-cases.framing`, `framing/duplicate-notification-lifecycle.framing` |
| Environment isolation | `multi/4.9-pub/sc-4.9-cross-env/environment/live-ptu-identical-identifiers.isolation` |

Future controlled captures should add separate issue-backed fixtures for party lifecycle gaps, the deferred mission lifecycle actions in [`mission-lifecycle-evidence-matrix.md`](mission-lifecycle-evidence-matrix.md), destination/travel, combat, ship lifecycle, trade/cargo, chat, organization presence, population, normal PU exit, server error, network loss, crash, and shard/server transition.

## Technology and Libraries

No new dependency is introduced. Fixture validation uses Node.js built-ins and the existing `node:test` runner through `test/fixtureCorpus.test.js`.
