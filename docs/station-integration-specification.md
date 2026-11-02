# Station API, identity, permissions, and inventory integration

| Field | Value |
| --- | --- |
| Status | Owner-authorized Local implementation; production API/evidence integration still blocked; see [implementation](station-client-implementation.md) |
| Owner direction captured | 2026-10-30 |
| Product boundary | Post-MVP; the existing local-only MVP remains unchanged |
| External dependency | Station API and developer portal are being built; endpoints and contracts are unavailable |
| Backlog | [Station integration stories](issue-draft-station-integration.md) |

## Outcomes and settled direction

Players can connect AstraDock Local to their existing Station account using Station's Discord sign-in, resolve game item identifiers into useful names through Station APIs, pull their Station inventory, and synchronize supported acquisitions, sales, drops, and losses. Station remains the authority for its account, inventory database, roles, and permissions. The same Station roles and permissions govern what a connected user can see and use in Local.

These are product requirements, not claims that current logs detect every listed action or that Station already exposes these capabilities. The developer portal will supply the reviewed integration contract. Local never connects directly to Station's database.

The owner's 2026-11-02 [movement and ownership policy](inventory-movement-and-ownership.md) separates personal-container transfers from ownership changes: station inventory ↔ personal backpack/hand/equipment preserves owned quantity; a qualifying completed ground placement/drop/throw removes its exact quantity. Container access, generic Interaction/Store, unknown destinations and overlay outgoing reports alone do not establish a qualifying Station write. Personal bindings, recovery/throw detection and gameplay proposal generation remain gated; mandatory review and both confirmations are unchanged.

Settled requirements:

- Station brokers Discord sign-in and issues credentials usable by Local. A Discord display name, Discord token, or log-derived Star Citizen identity does not independently authorize Station access.
- Configuration describes an approved Station service and typed capabilities. It does not introduce a general-purpose API request builder, arbitrary scripts, user-defined authentication code, or renderer network access.
- Item definitions, personal inventory, runtime observations, and official mined data retain distinct contracts and consent policies. A resolved item name does not prove possession.
- Station roles and permissions determine visibility and availability of connected capabilities. Local's privileged boundary enforces them, and Station authorizes every remote operation independently.
- Sign-in, permission grants, catalog reads, inventory reads, and inventory writes are separate concerns. Signing in does not enable uploads or grant every permitted feature automatically.
- Provide separate sign-in management and Station access management screens. Discord sign-in is optional for local-only use and required for Station account capabilities; no launch-time sign-in wall may block local monitoring or the overlay.
- Uncertain observations, missing inventory baselines, unknown permissions, and unknown item mappings remain explicit; they cannot silently become inventory mutations.

### Owner functionality and navigation decisions

The owner settled the following behavior for the current connected scope:

| Topic | Decision |
| --- | --- |
| Inventory submission | Review, then two separate "Are you sure?" confirmations before enqueue/send; no automatic approval or submission |
| Dropped items | Remove the approved dropped quantity from current Station inventory; do not retain it as owned with a dropped/location status |
| Game identities | One game account/character inventory binding per connected Station user; multiple game accounts/characters and an active-identity selector are out of scope for now |
| Access management | Only the currently signed-in, connected user's own access, connection and consent; no other-user or role administration in Local |
| Overlay filtering | Apply filters in order of specificity and narrow cumulatively: all active dimensions must match; no more-specific override. Purchase + Ammunition shows only ammunition purchases |
| Navigation | Sign-in and Station access screens are under Settings, with a small account/status control in the main header |
| Offline inventory | Previously downloaded personal inventory remains readable offline, with an obvious last-successful-update timestamp and stale/offline labeling |

The owner explicitly confirmed the sequence: **Review -> first confirmation -> second confirmation -> enqueue/send**. Reviewing a proposal does not count as either confirmation. Both confirmations are required for now; they cannot be disabled or remembered for new changes. Visual composition and remaining interactions still require design deliverables.

## Scope and release boundaries

The MVP remains local-only as defined in [PRD section 5.4](product-requirements.md#54-mvp-product-boundary--settled). This specification establishes future integration boundaries without adding a network requirement to monitoring or the overlay.

The **proposed Phase 1** connected increment is approved service configuration, Station-backed browser sign-in, permission projection, item resolution, inventory pull, and reviewed supported changes through a durable queue. This grouping delivers one coherent personal-inventory workflow while containing the risk of incorrect automatic writes. It is conditional on owner release approval, Station contracts, inventory semantics, design deliverables, and evidence gates; it is not a settled release assignment.

**Phase 2 planning candidates**, without committed implementation scope: richer location/container reconciliation and additional developer-portal capabilities. Automatic inventory submission is excluded by the current mandatory-review decision; revisiting it requires a new owner decision rather than an assumed later-phase upgrade. Do not move unsupported acquisition/sale/drop/loss detectors into a release just to complete the list. These need separate evidence and product decisions first.

Non-goals: rebuilding Local, implementing Station or its developer portal here, embedding Discord secrets, a new local role administration system, arbitrary REST/GraphQL consoles, all-game asset extraction, organization inventory sharing, remote log streaming, real-time collaboration transport, or making the game itself accept inventory changes. Station inventory is an account projection and cannot be represented as an authoritative game inventory snapshot without evidence.

## Terminology and identity boundaries

| Term | Meaning and constraint |
| --- | --- |
| Service profile | Local configuration identifying the approved Station destination, API version, issuer, public client registration, and supported capabilities; contains no secrets |
| Station subject | Stable server-issued account identity; never a mutable Discord nickname |
| Authorization context | Server-issued user/tenant context, effective permissions, authorization revision, and expiry, bound to the authenticated session |
| Game identity binding | Explicit association between a local game subject and the Station inventory owner; verification/selection contract remains open |
| Item definition | Catalog record for a kind of item; Station record ID, game class/GUID, and instance/entity ID are separate namespaces |
| Inventory snapshot | Station's inventory projection at a server revision, with declared completeness and environment scope |
| Observation | What a local source reports, with provenance and confidence; not an instruction to mutate Station |
| Change proposal | Minimized, versioned proposed inventory operation referencing qualifying observations or an explicitly approved user assertion |
| Operation | Immutable, scoped, idempotent submission with a server result; retries reuse its identity |

All account-bound state is partitioned by approved service identity, Station subject, authorized tenant where applicable, game identity binding, and environment. Catalog caches also include source, game build compatibility, locale, and catalog revision. LIVE and test universes never share inventory implicitly. A game wipe/reset needs a Station inventory epoch or equivalent contract; do not infer a reset from a new build or an empty response.

Current product scope supports one game account/character inventory binding for the signed-in Station user. Do not build a multiple-account/character picker or infer additional bindings from log IDs. The portal must still define how that single binding is verified. Signing out and subsequently connecting another Station user remains a security isolation case, not a multiple-game-account feature.

## Architecture and existing boundaries

The existing [hardened Electron boundary](hardened-electron-boundary.md), [canonical event contracts](runtime-event-contracts.md), [local privacy controls](local-settings-and-privacy-controls.md), and [time contract](time-contract.md) remain the starting points. Relevant navigation points are `src/main.js`, `src/preload.js`, `src/ipcBoundary.js`, `src/contracts/rendererApi.d.ts`, `src/settingsStore.js`, and `src/persistence/canonicalEventStore.js`. They currently provide local capabilities, preferences, and telemetry, not a Station client. Existing `username`/`userId` settings are local game filters, not Station credentials or authorization.

Expected boundaries, with module names left to implementation:

```text
Renderer -> validated product capabilities -> privileged integration coordinator
  -> service profile validation and bounded HTTPS transport
  -> browser sign-in coordinator and OS-protected credential storage
  -> session-bound authorization evaluator
  -> catalog adapter and bounded versioned cache
  -> inventory reader and snapshot repository

Canonical observations -> evidence/identity/policy gate -> reviewable proposal
  -> explicit review + double confirmation + consent + current authorization
  -> durable operation queue
  -> Station adapter -> per-operation result -> reconciled inventory projection
```

Keep contracts and business policies independent of Electron, HTTP, and renderer state. Adapters translate reviewed Station wire formats into validated domain contracts. Do not treat an example schema, mock server, or developer-portal draft as a production contract. A future utility-process migration follows ADR-0001; credentials and network authority remain behind narrow privileged boundaries.

## Configuring and consuming APIs

Profiles must record a stable service identity, display label, HTTPS API base, trust-pinned authorization issuer, public desktop client identifier, supported contract versions, and catalog/inventory/permission capabilities. Exact fields, defaults, and service discovery come from the portal decision. No production hostname, route, scope string, or SDK is invented here.

Validate configuration before activation. Reject userinfo, embedded credentials, malformed origins, unapproved schemes, and unsupported versions. Trust authorization metadata only after binding it to an approved service/issuer; server responses cannot silently replace that trust. API and login origins may differ only through an explicitly trusted registration. Changing destination invalidates authorization, partitions caches/queues, and requires fresh sign-in and consent; queued data never follows a new URL.

Production transport verifies TLS and rejects or independently validates redirects before sending any credential or payload. Do not forward credentials across origins. An isolated test harness may use loopback HTTP; production profiles cannot disable certificate verification or accept insecure APIs. The native OAuth loopback callback exception is distinct from API configuration. Define any support for private/self-hosted destinations explicitly before permitting them.

Transport supports cancellation, timeouts, bounded response bodies, bounded concurrency, pagination limits, and contract validation before cache changes. Handle unavailable service, rate limits, denied access, authentication expiry, unsupported contracts, malformed data, and partial results with safe errors. Honor bounded `Retry-After` and use exponential backoff with jitter. Catalog and inventory reads never block the tailer or require pausing local capture.

## Sign-in and credentials

Preferred sequence: Local starts a transaction-bound authorization request; the system browser opens Station; Station uses its existing Discord identity provider; Station returns a one-time authorization code to a registered native callback; Local exchanges it using PKCE and obtains Station-scoped credentials. This follows the existing PRD direction and [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252). Do not assume Station already supports the flow or that upstream Discord PKCE behavior satisfies Local's separate Station flow.

Use an established, reviewed OAuth/OIDC client implementation if needed; decide the package during implementation. Require PKCE S256, exact registered redirect handling, state validation, OIDC nonce/issuer/audience validation where OIDC is used, one-use/expiring transactions, protected callbacks, short-lived access tokens, and a reviewed refresh/revocation lifecycle consistent with [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700). Public desktop clients cannot keep a bundled client secret. Station retains Discord client secrets and upstream credentials; Local needs Station access, not a Discord bot token. [Discord's OAuth documentation](https://docs.discord.com/developers/topics/oauth2) describes the upstream integration, not the Station API contract.

Store long-lived credentials using an OS credential facility. If a supported platform has no secure facility, disable persistent sign-in or require reauthentication; do not fall back to plaintext preferences. Tokens, codes, cookies, verifiers, and private identity details stay out of renderer DTOs, URLs copied to diagnostics, raw evidence, and logs.

Cancel/timeout ends the transaction and cleans up listeners. Sign-out cancels unsent account operations, clears credentials, stops protected refreshes, and attempts remote revocation if supported. In-flight writes cannot be promised undone: keep their scope-bound operation identities and reconcile uncertain results only after the same account is reauthenticated. Account switches cannot expose prior private caches or resend prior operations. Disconnecting does not silently delete remote inventory; deletion is a distinct, authorized workflow.

## Station roles and permissions

Station owns roles, role membership, permission grants, and tenant scope. Local consumes effective permission identifiers rather than hard-coding role names such as `admin`, Discord IDs, or local role overrides. If Station initially exposes only roles, STN-001 must settle a versioned server-owned role-to-permission mapping before release. Role labels may be displayed as server text, safely rendered; they do not grant authority by themselves.

Define an explicit matrix mapping every connected UI action and privileged command to required permissions, token scopes, tenant/environment constraints, and consent. Logical capabilities include catalog read, own-inventory read, own-inventory write, and any future dataset publication/admin action; these are descriptions, not proposed production permission strings. Authorization is the intersection of valid session, scope, Station grants, resource ownership, destination/environment, and local consent. A permission alone never enables uploads.

The renderer receives a sanitized capability projection for navigation and controls. Features unavailable to a user's role must not remain actionable through alternate navigation, deep links, stale panels, or direct IPC. UX must distinguish lack of permission from offline, unknown, expired, unsupported, or not-yet-configured states. The design agent must settle hide-versus-disable behavior for each surface; Local may return a safe denial reason without revealing restricted data.

Local's privileged coordinator checks current authorization on each protected command and again immediately before queued dispatch. Station checks every read/write using its own current authorization and never trusts a client-supplied role, permission snapshot, owner ID, or hidden button. Denied reads expose no resource data; denied writes cause no mutation. Permission loss immediately stops affected local work once observed, cancels unsent dispatches, and hides protected cached views. A 403 triggers reevaluation rather than retrying as an outage or requesting broader access silently.

Authorization snapshots must be authenticated, bound to service/subject/tenant/session, revisioned, and finite-lived. Refresh on sign-in, application/session resume, tenant changes, expiry, and denial, plus a contract-defined bounded refresh schedule. Push notifications are optional; do not require WebSockets for this increment. The refresh interval/maximum staleness is a contract decision and must be tested before release. Fail closed for missing, stale, unrecognized, or malformed grants on remote operations and other protected capabilities. Offline mode cannot dispatch remote work.

The owner explicitly permits reading the connected user's previously authorized, downloaded personal inventory offline. This is a narrow local-cache entitlement, not a continuing remote permission grant: access-token or online permission-lease expiry alone must not hide that snapshot. Bind the entitlement to the same locally connected account and the snapshot's authorized owner/context; never expose another account's cache. Sign-out, explicit account disconnection, an observed permission revocation, deletion/reset or account change removes access according to the cache lifecycle policy. Losing the network is not account disconnection. Other protected cached views retain the finite-lease policy unless separately authorized. The portal handoff must accommodate this settled personal offline-read behavior. Do not promise immediate revocation to disconnected clients. Baseline local-only monitoring remains available independently of Station; identifying which additional local features become Station-controlled is an owner decision.

## Item catalog and resolution

The catalog adapter provides batched/paginated lookup using exact reviewed identifiers, returning Station ID, game identifier namespace/value, localized display name, compatible build(s), locale, catalog revision, retrieval time, and resolution status. Required versus nullable fields and maxima are settled by the portal contract. IDs are opaque strings, never numeric coercions or case-folded guesses; names are untrusted text.

Distinguish exact match, unknown identifier, ambiguous match, unsupported build, missing translation, stale cache, and unavailable service. Do not merge records by display name or substitute a label for an ID. Show a safe game class/identifier fallback with unresolved status. A stale name can remain a labeled presentation aid; a stale/ambiguous ID mapping must not authorize a write. Permission-gated catalog data cannot bypass the permission policy through its cache.

Coalesce repeated lookups, bound memory/disk/negative caches, and refresh by server revision/expiry/validator if supported. Do not fetch once per rendered row or mine game assets just to resolve a catalog miss. Cache transactions keep the previous validated revision on malformed/partial refreshes. Names are `enriched` provenance and never alter the original canonical observation or Friendly/Raw evidence semantics.

## Inventory pull and proposed writes

Pull inventory for the authenticated subject's authorized game identity and environment. Validate pagination and snapshot revision/consistency before replacing the current cache. A partial page, expired cursor, permission denial, timeout, or malformed response cannot become an empty inventory or zero count. Show the previous snapshot as stale or inaccessible according to authorization policy. A valid, complete empty snapshot is distinct from missing/unknown data.

Keep the last complete, authorized personal snapshot readable for that same connected user while offline. Display **Last updated** prominently above inventory rows, using the last successful complete download's absolute local date/time and timezone plus elapsed age. Show **Offline — cached inventory** when disconnected and an explicit stale state when freshness expires. An authorized empty snapshot still has a last-updated time; no prior complete snapshot shows **Never updated** and no invented timestamp. Opening the screen, a failed/partial refresh, a catalog-name update, a local proposal or a reconnect attempt cannot advance this timestamp. If Station supplies a separate inventory as-of time, label it separately from download/refresh time. Keep status and update time visible while browsing the cached data, including supported narrow layouts.

Inventory rows must distinguish Station item definition, instance versus aggregate identity, quantity/unit, ownership state, location/container if known, environment/epoch, server revision, and last-confirmed time. A Station baseline does not fill gaps in local logs. A transfer between owned containers must not increment total owned quantity. Unknown locations and quantities remain unknown.

Inventory submission requires **Review -> first confirmation -> second confirmation -> enqueue/send**, as explicitly directed by the owner. No role, consent checkbox, future retry, batch option or remembered confirmation may automatically approve a new change. The user must inspect the exact proposed items/quantities/actions and current versus proposed inventory effects before two distinct confirmation prompts. Bind both confirmations to the immutable reviewed payload, owner/environment/epoch and baseline revision; material changes invalidate them and return the proposal to review. Cancelling at review, the first confirmation or the second confirmation performs no enqueue or remote mutation. Do not auto-confirm a recovered session. Once a fully reviewed/confirmed operation is queued, retries may resend that identical authorized operation under the idempotency contract without treating the retry as a newly approved change; rebase, changed payload or resolved conflict requires a new review and both confirmations. Manual assertions remain a separate undecided capability; reviewing a proposal does not fill missing evidence.

| Gameplay category | Required boundary before changing inventory |
| --- | --- |
| Acquisition/purchase | A request or shop-reported success alone does not prove delivery; require approved possession evidence or a separately specified user assertion |
| Sale | Require an attributable completed sale and correct item/quantity; generic move, shop activity, or wallet messages are insufficient |
| Drop | A qualifying attributed drop proposes removing the exact dropped quantity from current Station inventory, subject to review and double confirmation. Preserve drop provenance/history, but do not retain that quantity as owned with a dropped/location status. A drop request, owned-container move or query alone cannot remove inventory |
| Loss | Require an approved attributable outcome or explicit reconciliation; disconnect, cache invalidation, missing query rows, entity cleanup, or unobserved time cannot prove loss |
| Move/equip/attachment | Treat location/equipment state separately from acquisitions and aggregate ownership |
| Failure/cancel/unknown | Preserve the observation and explanation; do not mutate inventory |

Evidence review on 2026-10-30 consulted the owner's [runtime observation catalog](runtime-observation-catalog.md) and October 29 capture ledgers, retained with the gameplay-overlay implementation foundation. They report successful inventory moves/drop, shop requests and success responses, but do not establish repeatable detection for every action or independent shop delivery. This integration does not establish new possession-change evidence. Link accepted sanitized fixtures and qualifying rules per action/build before enabling an inventory detector. Existing [runtime contracts](runtime-event-contracts.md) also separate shop requests from completion; no existing `stationSyncPolicy: never` event is made uploadable by this specification.

## Domain contracts to agree with the developer portal

This table describes logical requirements, not endpoint paths, JSON field spelling, an OpenAPI document, or committed schema versions. STN-001 must resolve wire representation, limits, and compatibility rules.

| Contract | Required information and validation |
| --- | --- |
| Service capabilities | Stable service/issuer identity, API versions, supported reads/writes, trusted origins; unsupported capability blocks its operation |
| Session and authorization | Stable subject, tenant if applicable, game-binding mechanism, permission IDs, token scope, authorization revision, issued/expiry instants; trusted server source |
| Item resolution | Identifier namespace/value, Station definition ID, locale/name, build compatibility, catalog revision, resolution status; no guessed ID mapping |
| Inventory snapshot | Owner context, environment/epoch, opaque revision, completeness/pagination, typed rows and quantities; no partial replacement |
| Inventory proposal | Contract/mapping/rule version, stable operation ID, subject/context binding, action, exact item reference, positive quantity with declared unit where applicable, source/target meaning, source and ingestion instants, provenance/confidence, minimized qualifying event reference; unknown required facts block submission |
| Write precondition | Expected revision or equivalent concurrency token; never client-clock last-write-wins |
| Per-operation result | Operation ID, accepted/applied/rejected/conflict/duplicate/unknown outcome, resulting revision and safe reason; transport acceptance is not application success |
| Error | Stable code, retryability, rate-limit information, safe correlation ID; no raw logs, secrets, SQL, or account enumeration |

Amounts use an exact documented representation, never unchecked floating-point arithmetic. Discrete item quantities are positive safe integers unless a typed decimal/unit contract is explicitly approved for fractional goods. IDs/revisions stay strings. Timestamps use canonical UTC milliseconds as in the time contract; display conversion occurs only at the UI boundary.

Raw logs, source paths, IPs, Discord credentials, unrelated players, and raw game account/entity IDs are excluded from default outgoing DTOs. If instance-level inventory requires a game identifier, document its necessity, scope, minimization/pseudonymization, retention, and user-visible consent before allowing it. Local event/evidence references never grant Station raw evidence access.

## Queue, reconciliation, and recovery

Persist operation identity, immutable minimized payload, destination/account/environment/epoch binding, consent revision, authorization requirements, expected server revision, explicit review/confirmation receipt bound to that payload, attempts, and result atomically before network dispatch. Only completed review and the required double-confirmation sequence can create a dispatchable operation. Pending review/confirmation is not dispatchable queue approval. Replaying logs, duplicated completion markers, rescans, and restarts cannot allocate another operation for the same accepted proposal. Correlation request numbers alone are not globally unique; include source generation/session and the approved semantic identity strategy.

States include awaiting review, queued, sending, retry scheduled, blocked by authentication/permission/consent/mapping, conflict, rejected, applied, and unknown outcome. Partial batch success is recorded per operation. Resume only eligible operations in a bounded order that preserves related item/container dependencies; one blocked item must not freeze unrelated work indefinitely. Define queue capacity, retention, expiry, and disk-full behavior before release. Never silently discard pending or unknown-outcome writes, and never let telemetry cleanup erase deduplication state still needed for retry safety.

Station must atomically enforce idempotency and mutation, retain deduplication records for at least the agreed retry horizon, and reject reused operation IDs with changed payloads. An HTTP timeout after server commit is an unknown outcome: query operation status or replay the identical operation under that contract. Without a server guarantee, automatic retry of a potentially applied mutation is blocked.

Concurrent Station edits, other devices, inventory wipes, or revision conflicts cause reconciliation. Pull a fresh complete baseline, preserve the proposal, and require the approved conflict policy; do not overwrite the whole inventory or silently rebase/subtract twice. After server acknowledgement, update/invalidate the appropriate snapshot by returned revision. Optimistic local proposals remain visibly separate from Station-confirmed quantities. A rejected decrement must not be clamped to zero or reinterpreted as success.

Pausing/revoking consent prevents further dispatch and marks unsent operations blocked. Sign-out and destination/account switches isolate all protected state. In-flight outcomes may still need later reconciliation. Local deletion/reset must include private caches, proposals, credentials, queue and deduplication metadata under an explicit policy; warn about pending/unknown remote outcomes and do not silently turn a reset into a duplicate write on recapture. Remote inventory/audit deletion and retention remain Station contracts, never implied by deleting local telemetry.

## Required information architecture and states

This is a content/behavior contract, not a layout or interaction design. The design agent must provide approved configuration, sign-in, permission-denied/expired, inventory, proposal review, conflict, and recovery flows using the owner's design-system archive. Unfinished Interactions/Dashboard behavior must be resolved with the owner before implementation.

Required management screens:

Both screens belong under **Settings**. A small account/status control in the main header provides connected/signed-out/offline/attention state and access to those Settings screens; it must not turn the header into a role administration or inventory workspace. Use a privacy-safe display identity when connected, not tokens or sensitive IDs. Header control activation opens the corresponding management flow without starting capture, signing in or granting consent automatically. Final control composition, labels, keyboard/focus behavior and narrow-viewport treatment remain design deliverables.

1. **Sign-in management:** explain that Discord sign-in connects the existing Station account and is optional for local use. Show disconnected/signed-in identity, Station destination, browser authorization progress and cancellation, expiry/re-authentication, safe errors, and sign-out. Provide a clear way to return to local-only use. Local never collects a Discord password or bot token. Do not expose account identity or credential material in the overlay.
2. **Station access management:** show the connected destination/account/tenant, role labels and effective permitted capabilities, permission freshness, capability availability/denial reasons, and separate catalog-read, inventory-read, and inventory-write consent/status. Provide only authorized connection, refresh, sync pause/resume, consent, and disconnect actions once their interactions are designed. Explain which changes affect only Local preferences and which require Station authorization. Signing in or receiving a role cannot silently turn on write consent.

The Station access management screen is limited to the currently signed-in, connected user's own access, Local connection and consent. Other-user administration, role editing and permission assignment are out of scope even when that user has an administrator role in Station. Neither screen can override server permissions. Settings placement and the header entry point are settled; final screen labels and visual composition are design deliverables.

Order information by destination/account/authorization first, then inventory environment/freshness, data, and outstanding changes. Required content:

- Connection: service label/origin, API support, signed-in display identity, tenant where applicable, role labels/effective capability summary, auth/permission freshness, and privacy-safe reason for unavailable capabilities. Secrets never appear. Actions: validate connection, sign in, cancel sign-in, reauthenticate, sign out/disconnect; action availability follows authorization and state.
- Catalog/inventory: localized item name with opaque ID in accessible detail, quantity and unit, ownership/location state, environment/epoch, provenance/confidence, catalog resolution, Station revision, and last confirmed time. Unknown is not zero; stale values carry their last-known timestamp. Prominently show Last updated and elapsed age, including offline cached views, rather than hiding freshness in a tooltip/detail. Actions: refresh/read and inspect details when permitted.
- Changes: action, affected item, exact quantity/unit or unknown, source/destination, observed time, why proposed/withheld, review status, confirmation stage, sync status, retry time, and safe failure/conflict reason. Actions: inspect minimized outgoing fields and before/after quantities, review/reject, explicitly complete double confirmation before sending, cancel at either stage, pause/resume eligible sync, retry identical approved operations safely, and resolve/reconcile conflicts through new review. Exact labels and interaction details require design approval; no implicit or default affirmative confirmation.

Use integer counts, explicit quantity units, named enum states, canonical IDs as opaque strings, and local date/time with timezone and canonical UTC in detail. Freshness is an elapsed duration with a last-success instant; use the existing time contract. Catalog translation is separate from identifier accuracy. Sensitive identifiers remain hidden/redacted unless a permission and purposeful detail view allow them. Do not display unverified prices/currency as paid amounts.

Every surface must distinguish not configured, signed out, loading/validating, authorizing, cancel/timeout, refreshing, known success, valid empty, missing/unknown, stale, disconnected/offline, unsupported, denied, expired/revoked, partial, mapping ambiguity, conflicting, pending/unknown write outcome, and recoverable/permanent error where applicable. Failure to authorize must not flash cached protected content. Define which states hide versus disable each action in the design deliverable.

Keyboard access, semantic labels/tables, focus restoration, status announcements without per-event spam, color-independent state, reduced motion, and readable long identifiers are required. At supported narrow viewports/scaling, preserve account/environment/permission context and critical recovery actions; stacking/overflow behavior requires a reviewed design. Sign-in or overlay subscription must not change source selection, capture, filters, or monitoring.

## Acceptance and verification gates

1. A complete developer-portal contract identifies supported service, authentication/redirects, permissions, item mappings, inventory reads/writes, idempotency, concurrency, errors, limits, retention, and versioning. Unsupported capabilities stay unavailable.
2. A synthetic integration harness proves browser sign-in, protected token handling, permission-controlled visibility and privileged commands, account/tenant/environment isolation, and expiry/revocation behavior.
3. Catalog resolution works offline with labeled permitted cache data, preserves exact IDs, and refuses ambiguous mappings for writes.
4. Inventory pull commits only complete consistent snapshots; unsupported/missing data never becomes an empty inventory.
5. Each promoted gameplay action has approved positive/negative fixtures and attribution/correlation rules. Mandatory review/double confirmation and dropped-quantity removal are enforced; unsupported observations remain withheld.
6. Restart, duplicate observations, response loss after commit, partial batches, concurrent edits, consent/permission revocation, and account switches cause no cross-account upload or duplicate mutation under the agreed Station contract.
7. Diagnostics, outgoing payload inspection, storage/deletion policies, accessibility, and measured transport/cache/queue bounds pass security/privacy/reliability review. Parser throughput is preserved during slow/offline Station operation.

Happy path: open sign-in through Settings/header; configure a synthetic trusted service; sign in through its browser test flow; load only the connected user's granted capabilities and single game binding; resolve exact item IDs; pull a complete inventory; disconnect the network and verify cached reading with obvious unchanged Last updated; reconnect; review a qualifying synthetic change including a drop decrement; complete both separate confirmations; submit once; confirm the server revision and local confirmed projection; restart and verify no duplicate.

Unhappy path: test malicious URLs/redirects, invalid callback/state/issuer, token refresh/storage failure, role removal and direct forbidden IPC, stale/offline permission leases with the personal snapshot exception, cross-account cache access, account/tenant/environment changes, an attempted second game binding or other-user administration, unknown/ambiguous catalog IDs, malformed/partial pages, unsupported builds, duplicate/incomplete log sequences, drop requests without qualified completion, negative/overflow quantity, cancellation at every review/confirmation step, changed payload/baseline during confirmation, restart mid-confirmation, timeouts before/after commit, 401/403/429/5xx, disk-full, queue expiry and revision conflict. Confirm offline failures cannot advance Last updated or dispatch writes. Check that each failure preserves safe local monitoring and never fabricates a Station-confirmed result.

## Decision register and remaining dependencies

| ID | Decision / required evidence | Owner or source |
| --- | --- | --- |
| D-01 | Approved Station origins, service identity, API/versioning/discovery contract and sandbox | Station developer portal |
| D-02 | Native public-client registration, issuer, redirect strategy per supported OS, refresh/revocation and secure storage | Station + Local security review |
| D-03 | Existing role/permission vocabulary, effective-grant contract, tenant scoping, freshness/lease and revocation policy; which additional local features are controlled | Station + product owner |
| D-04 | Settled: one game account/character binding per connected user; no multiple-identity selector. Open: binding verification contract, environments and wipe epochs | Station; owner scope settled |
| D-05 | Item identity namespace, localization, build compatibility, quantity/instance/container and inventory revision contracts | Station developer portal |
| D-06 | Settled: review followed by two separate confirmations before enqueue/send; no automatic submission. Open: assertions for unobservable actions and detailed baseline/reconciliation policy | Product owner + Station |
| D-07 | Settled: approved drops remove the dropped quantity from current inventory. Open: evidence qualification, sale/loss semantics, fractional goods, corrections and retraction | Product owner + evidence review |
| D-08 | Idempotency horizon/status lookup, concurrency, batching/errors/rate limits, retention/deletion and audit | Station developer portal |
| D-09 | Per-action/build accepted sanitized fixtures, false positives, missing and contradictory evidence | Runtime evidence review |
| D-10 | Settled: sign-in/access screens under Settings, small header account/status control, readable offline snapshot with obvious Last updated. Open: release phase, approved UI flows and remaining missing interactions | Product owner + design agent |
| D-11 | Settled: only the connected user's own access, connection and consent; no other-user/role administration in Local | Product owner |

No new runtime, framework, library, OAuth provider, transport, or API route is selected by this document. Use the existing stack unless a reviewed implementation decision justifies a change. Contract mocks can support implementation after authorization, but production acceptance remains blocked on the real reviewed Station contract and these applicable decisions.
