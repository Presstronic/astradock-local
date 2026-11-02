# Station client and overlay filters

Status: owner-authorized Local implementation, 2026-10-30. Live Station integration remains blocked on the developer-portal contract and reviewed inventory evidence. This document records delivered code and its limits; the [specification](station-integration-specification.md) remains the behavior contract.

## What works in the application

- A small header account/status button opens Station management under Settings. Sign-in, personal access/consent, and inventory have separate views. Local monitoring and the overlay require no login.
- The sign-in view validates and securely saves a nonsecret service label, public HTTPS service address and public desktop client ID. Changing configuration disconnects the old account and resets consent. Private addresses, credentials in URLs, query/fragment parameters, and insecure schemes are rejected. Saving configuration does not make any network request.
- The production sign-in and synchronization actions remain explicitly unavailable. No issuer, endpoint, permission string, Discord secret or production wire schema is invented; saving a profile cannot activate the unavailable adapter.
- Overlay category, action and item-type selections persist locally. Empty selection within a dimension means all values; selected values combine with OR, active dimensions with AND. Reset restores all curated types. Ammunition excludes unrelated/no-item rows unless No item is also selected, and every other active dimension still applies.
- Overlay classification uses explicit metadata and exact reviewed item classes. Unknown classes remain Unclassified item; missing item references remain No item. Classification does not parse friendly labels or raw messages. Purchase association runs before filtering, and filtering runs before the 80-row display cap over at most 160 source observations. Friendly/Raw select the same rows and retain the existing evidence bounds.

## Local Station architecture

`src/station/service.js` owns configuration, protected session/credentials, effective permissions, consent, complete snapshots, catalog cache, proposal review, confirmations, durable operations and recovery. It consumes a private adapter port; renderer IPC cannot install adapters, change roles, select another account, supply tokens, create evidence, or submit arbitrary URLs/payloads.

`src/station/contracts.js` runtime-validates all product commands and normalized adapter responses. `src/contracts/stationApi.d.ts` describes only renderer-safe data/capabilities. New Station commands use the existing sender-validated, versioned IPC envelope and error handling. The overlay preload still exposes only overlay capabilities, with no Station access.

`src/station/repository.js` uses a separate encrypted SQLite database under the application's Station directory. Its random key is wrapped by the existing OS-protected key provider. Tokens, personal inventory, proposals and queue records never go into renderer preferences or diagnostics. If secure storage is unavailable or the database/key/version is invalid, the app leaves data intact and disables Station storage rather than writing plaintext. Local monitoring remains available.

`src/station/transport.js` supplies a bounded HTTPS JSON transport for a reviewed adapter: fixed trusted origin, no redirected credentials, cancellation/deadline, four concurrent requests, 1 MiB request/response bounds and safe classification of authentication, permission, concurrency, throttling and unavailable states. Routes are private adapter inputs, not renderer inputs.

`src/station/oauth.js` supplies a one-use native public-client PKCE S256 transaction with exact loopback callback, state binding, expiry and cancellation. **It is not a complete OIDC implementation.** The future reviewed adapter must implement browser/callback lifecycle, token exchange, issuer/audience/signature/nonce validation where applicable, refresh/revocation and platform registration. It must use an evaluated library/provider integration when appropriate; the helper does not authorize skipping that review.

## Adapter handoff and external blockers

The production adapter in `src/station/adapter.js` deliberately reports unavailable. A production adapter must be supplied in privileged application code after the portal contract is reviewed; there is no renderer/dev-console shortcut to install it or a mock account.

The internal adapter port is an application boundary, **not a proposed Station API**:

| Operation | Normalized behavior required |
| --- | --- |
| `authenticate(context)` | Registered system-browser native flow; return validated Station session/effective grants and private credentials |
| `refreshAccess(context)` | Return the same subject/single game binding with fresh authoritative permissions; optionally return rotated private credentials atomically |
| `readInventory(context, cursor)` | Consistent revision/environment/epoch across bounded pages; explicit terminal completeness; normalized exact quantities/units |
| `resolveItems(context, ids)` | Unique exact ID/name or explicit unknown/ambiguous/unsupported status, revision and expiry; adapter must enforce actual build/locale compatibility from the reviewed catalog contract |
| `applyOperation(context, operation)` | Server-authorized, revision-checked mutation, immutable operation ID, per-operation applied/duplicate/rejected/conflict/pending result |
| `idempotencyWindowMs` | Actual guaranteed server deduplication horizon; absent/expired guarantee prevents retrying a potentially applied write |

Context contains the configured service, private session/credentials and an abort signal. It never comes from renderer-supplied identity or grants. Permission booleans are normalized by the reviewed adapter from Station's authoritative vocabulary; they are not new production scope strings. Station must independently authorize every operation. Network errors must be translated to the safe `StationError` vocabulary.

Before live integration can be enabled, supply approved origins/issuer/client registration; authentication and permission contracts; single game-binding verification; catalog/build/locale mapping; inventory epoch/revision/pagination; server idempotency/concurrency/status semantics; limits/retention and a sandbox for real contract tests. Synthetic adapters in tests establish Local behavior only.

## Inventory behavior implemented behind the port

Reads commit only a complete consistent snapshot, at most 100 pages and 10,000 rows. Failed, repeated-cursor, malformed, conflicting-revision or incomplete reads preserve the previous data and last-update time. A complete empty snapshot is a valid update. Catalog requests contain at most 100 exact IDs and the local cache contains at most 1,000 entries; no fuzzy label-to-ID conversion is allowed.

The same locally connected user's previously authorized personal inventory remains readable offline and after online credential/grant expiry. It is labeled cached/offline with an obvious absolute Last updated date/time/timezone and elapsed age. Snapshot freshness changes only after a successful complete refresh. Sign-out, explicit account disconnection, observed read-permission revocation, reset and account change remove access. Network loss alone does not. Cached reading never grants remote authority. Effective authorization refresh is scheduled at most once per minute when a production adapter/session is available, with checks again at protected commands/dispatch.

Only a privileged reviewed evidence integration can call `offerQualifiedChange`. There is **no renderer proposal-creation IPC and no production gameplay-to-inventory detector enabled by this change**. Existing request/shop-success/attachment observations do not prove possession. This is an independent evidence blocker: accepted per-build attribution, completion, item identity and exact quantity rules/fixtures must be supplied before automatic proposal collection can be wired. The UI explains when no qualified changes exist.

The normalized proposal retains event/rule identity, source/ingestion times, game build/environment/epoch, provenance/confidence, exact mapped item and positive integer count. Only discrete `items` are supported initially. Acquisitions increment; sales, drops and losses decrement. A new acquisition requires a fresh exact catalog mapping; multiple matching inventory rows, incompatible units, fractional/overflow counts, unknown mappings and negative outcomes block review. No request, missing query row or owned-container transfer is converted into a mutation.

The explicit UI sequence is **Review -> first confirmation -> second confirmation -> enqueue/send**. The main process requires rotating one-use challenges for both confirmations, bound to the exact proposal, owner/environment/epoch, inventory and authorization revisions. Review expires after five minutes; cancellation, changed relevant state and restart invalidate unfinished confirmations. Every stage includes the precise item, before/after quantity and destination. Focus moves to the stage heading rather than automatically accepting a prompt. Consent or role grants cannot skip the sequence.

Dispatchable records, confirmation receipts, attempts and results persist before network calls. Paused or unauthorized work does not send. Identical retry uses the original operation ID and immutable payload only within the adapter's guaranteed server idempotency window. Response loss, partial acknowledgement, restart during dispatch or changed account may leave an explicit unknown outcome. Conflicts require a fresh baseline and new review/confirmations; they are never silently rebased. Confirmed quantities are refreshed from Station after application, not replaced with speculative local totals. The queue supports at most 500 operation records and 500 proposals; capacity errors do not silently discard work.

Reset refuses unresolved remote operations. It clears configuration, credentials and private caches while retaining only bounded SHA-256 semantic deduplication digests, preventing recaptured observations from re-creating an already confirmed change after reset. These digests contain no raw lines/account/item IDs and have a 10,000-entry bound; reaching capacity blocks new approvals. Their final expiration/compaction policy remains part of the real Station idempotency/retention contract. Telemetry retention never erases the Station outbox.

## Verification and compatibility

Focused tests cover origin/size/cancellation errors; exact PKCE callbacks and replay; encrypted restart/wrong-key failure; incomplete snapshots and offline freshness; credential rotation/revocation; cross-account late responses; review plus two separate confirmations; unit/identity/quantity guards; crash/retry idempotency; reset deduplication; cumulative overlay matching before the visible cap; and UI focus/cancel/permission behavior. Production API/Discord tests remain blocked on Station.

The implementation adds no package dependency, remote service URL or production secret. The renderer consumes shared JSON filter vocabulary through the existing TypeScript/Vite toolchain. Existing preferences migrate to show-all filters. The standalone Station database has schema version 1 and does not migrate/reset canonical telemetry.

While running verification, the existing Windows tailer qualification exposed an unsafe-number inode collision. The tailer now requests bigint file metadata and serializes device/inode identity losslessly, keeping numeric byte offsets bounded. A regression distinguishes neighboring inode values above `Number.MAX_SAFE_INTEGER`; existing safe-inode checkpoint strings remain compatible. Old checkpoints whose inode was previously discarded may correctly fail identity matching and recover instead of silently skipping replacement data. This is recorded as a separate reliability fix, not a relaxation of the qualification test.
