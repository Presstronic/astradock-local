# Station integration backlog

Status: reviewable story drafts, 2026-10-30. These do not authorize implementation or invent a Station API. The [integration specification](station-integration-specification.md) defines product boundaries, security requirements, contract decisions D-01 through D-11, and UI information/state requirements. Each draft below must retain its context and applicable specification links when published as an issue.

## Release organization and dependencies

| Release bucket | Scope and reason |
| --- | --- |
| MVP | No Station implementation; retain optional account connection seams and independently usable local monitoring/overlay |
| Phase 1, proposed | STN-001 through STN-009, gated below: one coherent connection, identity/permissions, catalog, pull, and reviewed inventory-sync workflow |
| Phase 2, unassigned candidates | Automatic per-action inventory updates, richer container/location reconciliation, additional portal APIs; separate decisions/evidence precede implementation stories |

Phase 1 is a proposal pending owner release approval (D-10), not a settled milestone. STN-001 and STN-007 are decision/evidence spikes; they may proceed as specification work without implementing the app. All implementation stories require explicit implementation authorization. Dependencies indicate logical contracts, not an assumption that another repository has completed them. No automatic sync or user/role administration is assigned to a phase while its scope is undecided.

Delivery order: STN-001 -> STN-002 -> STN-003 -> STN-004. STN-005 and STN-006 then supply resolved names and inventory baselines. STN-007 supplies per-action evidence; STN-008 supplies the durable transport boundary. STN-009 integrates eligible proposals with review and reconciliation only after their policy is approved. Catalog/read-only access must remain useful when writes are unsupported.

## STN-001 — Agree the developer-portal integration contract

**Phase:** Proposed Phase 1 prerequisite; decision/integration spike.

### Context, story, and intended outcome

Station uses Discord identity and is building a developer portal, but Local has no reviewed API contract. As the engineers delivering both products, we need an agreed public desktop-client contract so Local can integrate without guessing routes, permission strings, or inventory semantics. Produce a versioned handoff and explicit decisions, not a mock presented as an implemented API.

### Scope and technical elaboration

Inventory the portal's available documentation, sandbox, ownership and delivery dependencies when supplied. Resolve specification D-01 through D-08 and D-11: trusted origins/service identity; public-client registration, issuer, redirect per supported OS, refresh/revocation; permission vocabulary/effective-grant lease; subject/tenant/game binding; item namespaces/build/locale; inventory quantities/instances/epochs; review/drop policies; pagination, revisions, operation results, idempotency retention, concurrency, errors and rate limits; retention/deletion. Record supported versus unavailable capabilities independently. State which existing local capabilities remain independent of Station and which additional features the owner wants permission-gated. Document authentication versus consent and server-side enforcement. Supply sanitized examples and compatibility expectations; choose OpenAPI or another portal format only when its actual contract is known.

### Non-goals; dependencies, assumptions, and risks

No application, portal, OAuth server or database implementation; no production probing, secrets, or blanket API key. Depends on Station developer-portal materials and owner decisions. Delayed API work may leave a documented blocker. A Discord identity provider is not evidence of Station native-client support. Access-management administration scope is unresolved.

### Acceptance criteria

- Every logical contract in the specification maps to reviewed documentation or an explicit unavailable/blocked entry.
- Station and Local ownership, security boundaries, permission semantics and versioning are unambiguous.
- Automatic writes remain blocked without atomic idempotency, concurrency rules and approved evidence/policy.
- Optional local-only use and distinct sign-in/access-management screens are retained.

### Happy-path test steps

Trace a synthetic account from browser login through grants, exact item lookup, complete inventory pull and one revision-checked operation/result. Verify both sides can implement from the handoff.

### Unhappy-path test steps

Trace permission removal, account/environment switch, ambiguous mapping, partial snapshot, response lost after commit, concurrent edit, stale grant, and unavailable API capability. Record unresolved behavior as a blocker.

### Definition of Done

Reviewed contract/evidence links, decision outcomes, sanitized examples, threat/privacy notes, offline/compatibility/retention policies, and actionable dependencies are committed. Documentation review and link checks pass; remaining blockers have owners. No runtime test changes required for this spike.

### Technology and libraries

None. Record the actual portal/API/auth technologies as integration evidence; this spike approves no dependency.

## STN-002 — Configure a trusted Station service and bounded client transport

**Phase:** Proposed Phase 1; Technical Story. **Dependencies:** STN-001 service/version/capability/error contracts; implementation authorization; approved configuration interaction design.

### Context, story, and intended outcome

Local's hardened preload exposes product operations, not arbitrary HTTP requests. As the Local integration maintainer, I need a validated Station service profile and replaceable bounded transport so catalog, permissions and inventory APIs share one safe connection boundary.

### Scope and technical elaboration

Start from `src/main.js`, `src/preload.js`, `src/ipcBoundary.js`, `src/contracts/rendererApi.d.ts`, and `src/settingsStore.js`; current preferences contain local game filters, not Station configuration or tokens. Introduce a versioned nonsecret service configuration repository, validated activation command and transport adapter behind the privileged boundary. Enforce the specification's approved origin/issuer, TLS, redirect, cancellation, timeout, size, concurrency, pagination and safe-error rules. Use explicit capability methods; no renderer-supplied arbitrary headers/URLs. A destination change partitions cache/queue data and invalidates sign-in/consent. Preserve local capture while requests fail. Publish privacy-safe connection health. Define measured bounds with the actual portal contract and compatibility migration of settings before coding.

### UI information and behavior

Configuration content belongs to the management flows: service label/origin, configured API version, supported capabilities, validation state and last check. Actions validate/save/cancel a profile through approved interactions. Distinguish unconfigured, validating, ready, unknown, disconnected/offline, unsupported, denied, loading and error; never display secrets. Apply specification accessibility/responsive constraints; design agent supplies composition and final labels.

### Non-goals; assumptions and risks

No sign-in, inventory business logic, general API builder, automatic endpoint discovery from arbitrary origins, insecure production mode, or new role system. Portal may supply one fixed destination rather than user-editable profiles; resolve that in STN-001 before adding controls. Third-party redirects and huge responses are untrusted.

### Acceptance criteria

- Only approved, validated profiles activate; invalid input leaves the current configuration intact.
- No credentials or personal data reach an unapproved origin; unsupported capabilities stay unavailable.
- Cancellation, slow/offline service and malformed responses do not block monitoring or corrupt settings.
- Existing installations remain local-only until the user configures Station.

### Happy-path test steps

Configure a synthetic trusted service, validate capabilities, restart, and call one bounded adapter read. Change destination and verify session/consent invalidation and partitioning.

### Unhappy-path test steps

Reject userinfo, invalid/insecure origins, mismatched issuer, redirect to another host and unsupported version. Simulate huge/partial payloads, timeout, cancellation, 429, TLS failure and interrupted settings writes; verify safe errors and intact prior state.

### Definition of Done

Runtime-validated contracts, focused transport/configuration/security tests, settings compatibility tests, documented limits/recovery and user guidance are complete. `npm test`, relevant build, accessibility/privacy review, monitoring-latency check and diff review pass; a documented PR is reviewable.

### Technology and libraries

Existing Electron/Node network and IPC facilities, TypeScript contracts and settings storage support the integration boundary; exact HTTP API selection follows evaluated needs. New dependencies: **None expected**. Actual Station HTTPS API/version is blocked on STN-001.

## STN-003 — Manage optional Discord-backed Station sign-in

**Phase:** Proposed Phase 1; User Story. **Dependencies:** STN-001 native-client contract; STN-002; approved sign-in screen/redirect and OS credential-storage decisions.

### Context, story, and intended outcome

As a player, I want an optional sign-in management screen that connects my existing Station account through Discord, so that I can use Station without needing a separate Local identity or signing in for local-only play.

### Scope and technical elaboration

Implement Station's reviewed browser authorization flow with transaction-bound PKCE/state and OIDC validations where applicable. Station handles Discord; Local receives Station credentials and stable subject context. Add explicit account connect/cancel/reauthenticate/sign-out capabilities through validated IPC. Keep tokens in the privileged process and OS credential facility, not `settingsStore`, renderer data or diagnostics. Select and test the native redirect per supported platform, duplicate callbacks, lifecycle cleanup and credential persistence fallback. Sign-out cancels unsent dispatches, isolates private account caches and retains minimal uncertain-operation identities for same-account reconciliation. Extend reset/deletion documentation; no remote inventory deletion on logout. Sign-in remains separate from permissions/consent in STN-004.

### UI information and behavior

A dedicated management screen explains optional local-only use and Station/Discord account linkage. Show service, safe signed-in identity, auth state, expiry and actionable failure. Actions: sign in, cancel, reauthenticate, sign out and return to local use. Cover signed out, authorizing, cancelled/timed out, signed in, refreshing, expired/revoked, disconnected, unknown, unsupported and error. No Discord password/token entry. Approved designs must cover focus return from the browser, keyboard-only operation, announcements and narrow viewports. Never make this a mandatory launch screen.

### Non-goals; assumptions and risks

No embedded login webview, Discord client secret/bot, silent signup/account merge, game ownership verification, remote role administration or implicit upload consent. Browser completion does not prove authorization until the callback/token validation succeeds. Secure storage may be unavailable on some Linux environments.

### Acceptance criteria

- Local monitoring/overlay function with no Station login; Station account operations require a valid session.
- Browser sign-in produces the correct stable Station identity and exposes no tokens to the renderer.
- Invalid/expired/replayed callbacks cannot establish a session; cancellation cleans up the transaction.
- Logout/account switch prevents cross-account cache access or queued dispatch; remote outcomes are not falsely reported undone.

### Happy-path test steps

Use a synthetic Station browser flow; sign in, restart using secure storage, reauthenticate and sign out. Verify local-only operation before and after and token-free renderer/diagnostics output.

### Unhappy-path test steps

Inject invalid state/nonce/issuer/audience, wrong redirect, duplicate callback, cancellation, timeout, refresh/revocation failure and unavailable OS secret storage. Switch accounts with a write in flight and verify isolation/unknown-outcome handling.

### Definition of Done

Contract/auth lifecycle tests and supported-platform callback/secure-storage checks pass. Sign-in screen has approved design and accessibility verification. Threat/privacy review, migration/reset documentation, `npm test`, relevant build and reviewable PR are complete.

### Technology and libraries

Station OAuth/OIDC native-client API is needed for account authorization; browser and credential storage use reviewed Electron/OS integrations. An OAuth client/secure-storage package is **undecided** and requires documented version, license, maintenance and security evaluation before addition. No dependency is approved by this story.

## STN-004 — Apply Station permissions and manage personal Station access

**Phase:** Proposed Phase 1; User Story + Technical Story. **Dependencies:** STN-001 permission/lease/tenant and D-11 scope decisions; STN-002/003; approved access-management design.

### Context, stories, and intended outcome

As a connected player, I want Station's existing roles and permissions to determine what I can see and use in Local, so that my access is consistent across both products. As the security maintainer, I need the privileged coordinator and Station server to enforce the same authorized capability boundaries, so that hiding controls is not the only protection.

### Scope and technical elaboration

Add a versioned, validated, session-bound effective-authorization model and explicit capability-to-permission/scope/consent matrix. Consume server permission IDs; never derive access from usernames, Discord IDs, editable settings, or ad hoc role names. Recheck in main-process commands and immediately before dispatch; Station independently checks its own grants and resource ownership. Refresh at login/resume/context change/expiry/denial and a bounded reviewed schedule. A 403 revokes affected local availability and pauses dispatch rather than retrying indefinitely. Unknown/malformed/stale grants fail closed. Enforce finite offline authorization leases and prevent cache flashes on logout/role loss; do not promise instant disconnected revocation. Baseline monitoring/overlay remain usable without Station. Integrate per-capability consent for catalog/inventory reads and inventory writes; granting permission/signing in never opts into synchronization.

### UI information and behavior

Create a distinct Station access management screen: destination/account/tenant, safe role labels, permitted capability list, grant freshness/expiry, read/write consent and sync state, and unavailable reasons. Authorized actions manage this Local connection, refresh access, change consent, pause/resume eligible sync and disconnect. Role editing/other-user administration remain excluded until D-11 explicitly expands scope. Design agent must settle hide/disable rules and focus recovery when access changes. Cover loading, known granted/denied, missing/unknown, unsupported, stale/offline, expired/revoked, reconnecting, consent disabled, success and error. Use accessible text, no color-only distinctions, no private denied-resource data; keep management usable at supported narrow widths.

### Non-goals; assumptions and risks

No local permission overrides, replacing Station role administration, consent as a substitute for permission, or scope escalation. A signed-in user may have zero connected capabilities. Portal may initially expose roles only; release requires a server-owned effective mapping. Role changes can occur during a command or queued write.

### Acceptance criteria

- Different synthetic Station grants produce the corresponding available Local views/actions.
- Direct IPC/deep links/stale panels cannot bypass a missing permission; remote denial yields no data/mutation.
- Observed revocation/expiry stops protected work, conceals restricted cached content and leaves independent local capture running.
- Sign-in/grant refresh cannot enable write consent; consent revocation blocks unsent writes.

### Happy-path test steps

Compare two synthetic roles with different catalog/read/write grants. Verify navigation, screen content, privileged calls, server authorization and consent separately; grant access and refresh to enable only that capability.

### Unhappy-path test steps

Remove a role while a screen is open and a write is queued; forge renderer grants and direct IPC; simulate expired/malformed/offline snapshots, revoked token, tenant switch and 403. Confirm fail-closed behavior and account isolation without stopping local monitoring.

### Definition of Done

Permission matrix and finite freshness/offline policy are documented. Boundary/UI/queue tests cover denial, expiry and revocation races. Approved design, accessibility/privacy/security review, safe diagnostics, reset behavior, `npm test`, relevant build and reviewable PR are complete.

### Technology and libraries

Station effective-permission API/metadata is needed to reuse authoritative access; no production endpoint or permission identifiers selected yet. Existing IPC/contracts/renderer stack is reused. New dependencies: **None expected**.

## STN-005 — Resolve item IDs and names with a bounded catalog cache

**Phase:** Proposed Phase 1; User Story. **Dependencies:** STN-001 item/build/locale contract; STN-002; STN-003/004 for protected catalog access; approved item-detail design.

### Context, story, and intended outcome

As a player, I want exact game item identifiers resolved into useful Station names and metadata, so that telemetry and inventory are understandable without guessing which item a log class represents.

### Scope and technical elaboration

Implement a catalog port/adapter, runtime-validated definition/resolution contracts, batched lookup and bounded versioned cache. Distinguish Station definition ID, game class/GUID and instance/entity ID. Preserve exact opaque strings, build compatibility, locale/revision, freshness and enriched provenance. Unknown/ambiguous/stale mappings cannot authorize writes. Coalesce lookups rather than requesting per rendered row; define measurable cache/concurrency/expiry bounds from the contract. Keep last validated cache on malformed refresh, partition by service and compatible context, and apply permission leases to protected data. Enrichment does not rewrite canonical observations or raw source text. Do not add network requests to overlay subscriptions; any later overlay enrichment consumes an already permitted cache projection.

### UI information and behavior

Existing event/item surfaces show name and exact identifier detail, resolution status, build/locale, provenance and last refresh. Unknown names fall back to safe class/ID text. Distinguish exact, missing translation, unresolved, ambiguous, unsupported build, loading, empty, stale, offline, denied and error; support authorized refresh/inspect actions. Follow shared detail accessibility and responsive constraints; final composition requires design approval.

### Non-goals; assumptions and risks

No fuzzy name-to-ID mutation, entire database download/mining, possession inference, new catalog administration, or complete item-type taxonomy. Catalog text and metadata are untrusted. Public versus protected access and missing-translation semantics require STN-001.

### Acceptance criteria

- Exact compatible identifiers resolve without merging same-name items; original source IDs are preserved.
- Unresolved/ambiguous/build-mismatched values remain explicit and ineligible for automatic mutation.
- Cached names remain useful under the permission/freshness policy without per-row network requests.

### Happy-path test steps

Resolve a synthetic batched ID set, refresh revision, change locale and render cached names offline when permitted. Verify exact IDs and unchanged original observations.

### Unhappy-path test steps

Test unknown IDs, duplicate names, ambiguous mappings, unsupported builds, missing translations, malformed/oversized responses, revoked read access, offline expiry and destination switch. Confirm cache bounds and no guessed writes.

### Definition of Done

Adapter/cache and boundary/UI tests pass; cache limits and latency under large streams are measured. Provenance, privacy, compatibility, retention and offline behavior are documented. Approved UI/accessibility review, `npm test`, relevant build and reviewable PR are complete.

### Technology and libraries

Station catalog HTTPS API is needed for authoritative item mapping. Reuse reviewed transport, local storage and renderer infrastructure. New dependencies: **None expected**; schema fields/version remain STN-001 outputs.

## STN-006 — Pull a complete account-scoped Station inventory

**Phase:** Proposed Phase 1; User Story. **Dependencies:** STN-001 inventory/game-binding/environment/epoch contracts; STN-002/003/004; STN-005 for optional names; approved inventory design.

### Context, story, and intended outcome

As a connected player, I want to pull my current Station inventory into Local, so that I can see the remote baseline and distinguish it from pending local observations.

### Scope and technical elaboration

Implement validated paginated snapshot reads and an account/environment/epoch-scoped repository behind IPC. Server authorizes owner scope; renderer cannot substitute another user ID. Commit only complete consistent revisions, preserving prior state on timeout, malformed page or expired cursor. A complete valid empty snapshot is different from failed/missing data. Separate definition versus instance/aggregate IDs, quantities/units, ownership/location, revisions and last-confirmed times. Names can remain unresolved without blocking a correct ID-based read. Model read-only availability independently of write support. Define refresh, wipe/epoch, retention, reset/deletion and account-switch behavior before coding; never synthesize inventory totals from log queries.

### UI information and behavior

Show account/destination, game binding/environment/epoch and snapshot freshness before rows. Rows show name/ID, exact quantity/unit, instance/aggregate meaning, ownership/location when known, and confirmed-versus-pending status; details expose provenance/revision and canonical time. Actions refresh and inspect when permitted. Cover loading, valid empty, unknown baseline, partial failed refresh, stale/offline, disconnected, denied/expired, unsupported and error. Unknown is not zero. Sorting/default grouping, responsive table behavior and keyboard/detail interactions require design delivery.

### Non-goals; assumptions and risks

No write, authoritative game inventory claim, manual bulk replace, organization inventory, or treating absent response rows as losses. Concurrent Station edits require stable pagination/snapshot semantics. Multiple game accounts/wipes cannot be guessed from Discord identity.

### Acceptance criteria

- Correctly authorized owner/context receives a complete revisioned snapshot.
- Failed/partial reads never clear or partially replace the baseline; valid empty snapshots do.
- Account/tenant/environment switches never expose another scope's cached data; writes are independently unavailable until approved.

### Happy-path test steps

Pull a multi-page synthetic snapshot, display exact quantities and revision, refresh to a newer complete revision, and load a legitimate empty inventory.

### Unhappy-path test steps

Inject page loss, cursor expiry, revision changes during pagination, malformed quantities/IDs, unauthorized owner/environment, service loss, permission expiry and account switch. Verify no false zero inventory or cross-scope cache exposure.

### Definition of Done

Snapshot completeness, partitioning and UI-state tests pass; bounded pagination/storage and monitoring performance are verified. Approved accessible design, privacy/retention/migration documentation, `npm test`, relevant build and reviewable PR are complete.

### Technology and libraries

Station inventory-read HTTPS API is needed for the remote baseline. Reuse transport and approved encrypted local persistence abstractions; do not store account data in generic renderer preferences. New dependencies: **None expected**.

## STN-007 — Establish per-action inventory evidence and ownership policy

**Phase:** Proposed Phase 1 prerequisite for writes; evidence/decision spike. **Dependencies:** Owner gameplay annotations, reviewed sanitized fixtures and game bindings; STN-001 inventory semantics; D-06/D-07/D-09 decisions.

### Context, story, and intended outcome

Observed requests, shop-reported success and attachments do not independently establish ownership changes. As the product/evidence reviewer, I need accepted per-build positive and negative evidence for each inventory action so that Station changes reflect supported outcomes rather than parser optimism.

### Scope and technical elaboration

Read the durable runtime observation catalog before any capture. Preserve existing findings and separate observed evidence, inference, repeatability and implementation. Review acquisitions, purchases, sales, drops, losses, moves and equipment separately; do not require all detectors for a first narrow write release. Record player attribution, session/source generation, request/result correlation, quantities, instance/definition IDs, duplicates, missing lines, interruption and context expiry. Distinguish owned-container moves from acquisitions and dropped location from ownership loss. Resolve review/automatic policy and any permitted user assertions without presenting an assertion as a logged fact. Produce an accepted/withheld action matrix and link privacy-safe committed fixtures; update the catalog/dated ledgers only for actual new exercises.

### Non-goals; assumptions and risks

No application detector, synthetic evidence presented as real, or assumption that unsupported sales/losses are impossible forever. No promotion of `stationSyncPolicy: never` events by reusing their payloads. The October owner worktree catalog was consulted for the specification but is not committed by this backlog; detectors require their own reviewed evidence handoff.

### Acceptance criteria

- Every candidate action states required facts, supported builds, attribution/correlation, confidence, false positives and gaps.
- User-confirmed ground truth remains separate from repeatable automatic detection.
- Unsupported/ambiguous cases are withheld; drop ownership and review policies are explicit decisions.

### Happy-path test steps

Walk an annotated, sanitized supported action from intent through qualifying outcome; verify the same event sequence implies exactly one proposed semantic change.

### Unhappy-path test steps

Review query/preview/cache cleanup, failed/cancelled attempts, repeated results, overlapping purchases, mid-request capture, missing completion, unobserved loss, attachments and moves between owned containers. Confirm none can falsely increment/decrement inventory.

### Definition of Done

Evidence matrix, owner policy decisions, limits and fixture links are reviewed and committed; privacy/link checks pass. Any capture updates preserve the catalog and dated provenance. Follow-up detector implementation stories are scoped only to accepted families; no broad automation story is implied.

### Technology and libraries

None. This is evidence/decision work using existing capture and fixture tooling; introducing a new capture tool requires separate evaluation.

## STN-008 — Deliver a durable authorized inventory operation queue

**Phase:** Proposed Phase 1; Technical Story. **Dependencies:** STN-001 atomic idempotency/result/concurrency/retention contracts; STN-002/003/004; reviewed persistence/reset and queue-capacity policy.

### Context, story, and intended outcome

As the inventory integration maintainer, I need durable, scope-bound, retry-safe operations so that crashes and unreliable networks cannot duplicate or misdirect inventory mutations.

### Scope and technical elaboration

Implement immutable minimized operation records and atomic enqueue/result transitions behind an inventory outbox repository, separate from raw evidence and ordinary telemetry retention. Bind identity, destination/account/tenant/game/environment/epoch, consent revision, required permissions and expected server revision before dispatch. Deduplicate proposals/replay using stable semantic identity rather than session-local request numbers. Recheck live consent/auth/grants immediately before network calls. Support bounded batches/concurrency, per-operation acknowledgements, safe retries with jitter/Retry-After, cancellation of unsent work, blocked/rejected/conflict/unknown states, capacity/disk-full handling and restart recovery. Station must atomically deduplicate mutation and reject altered reuse of an ID; loss after commit requires status lookup or identical replay under that guarantee. Conflicts surface for reconciliation, never silent overwrite/rebase. Define related-operation ordering without indefinite global head-of-line blocking. Reset/retention cannot delete outstanding retry/deduplication metadata silently.

### Operator information and behavior

Expose sanitized queue counts, operation IDs in detail, state, last attempt, next retry, safe failure/conflict reason, scope and last confirmed revision through typed queries/subscriptions. No new standalone screen is required; STN-004/009 consume these DTOs. Unknown remote outcome is distinct from failure. Secrets/raw logs never enter diagnostics or DTOs.

### Non-goals; assumptions and risks

No gameplay detector, raw-log upload, client-authorized inventory owner, automatic conflict resolution, new realtime transport, or safety guarantees absent server idempotency. Offline work can be retained but cannot dispatch. Maximum retry horizon, queue bounds and idempotency retention are required contract decisions.

### Acceptance criteria

- Duplicate enqueue, replay, restart and response loss after commit cannot apply the same operation twice under the server contract.
- Authorization/consent loss, sign-out and scope changes prevent affected unsent dispatches.
- Partial batch results and revision conflicts remain explicit; no HTTP acceptance is mislabeled as applied.
- Full disk/capacity produces a visible failure without silent data loss or disrupting capture.

### Happy-path test steps

Persist synthetic operations, restart, dispatch, record per-operation results and refresh confirmed revisions. Replay duplicates and verify exactly one server mutation per operation.

### Unhappy-path test steps

Inject crashes before/after enqueue, timeout after server commit, reordered/partial acknowledgements, 401/403/429/5xx, conflicting revisions, payload-changed duplicate IDs, token/permission/consent revocation during dispatch, disk-full and reset with unknown outcomes. Verify scope isolation and bounded retry.

### Definition of Done

Contract/fault-injection/persistence/authorization tests pass. Queue limits, idempotency horizon, retention/reset, recovery, privacy/security and performance are documented and verified; `npm test`, relevant build and reviewable PR are complete. Real Station contract tests remain a release requirement beyond synthetic harness results.

### Technology and libraries

Station inventory-write/result/status HTTPS APIs provide server guarantees. Reuse approved encrypted SQLite repository and transport boundaries; any schema migration must preserve existing telemetry. New dependencies: **None expected**; no queue package is selected.

## STN-009 — Review supported inventory changes and reconcile Station results

**Phase:** Proposed Phase 1, conditional on reviewed submission policy; User Story. **Dependencies:** STN-001; STN-004/005/006/007/008; explicit implementation authorization; settled review/drop/assertion policy and approved inventory/review/conflict designs.

### Context, story, and intended outcome

As a connected player, I want supported local inventory changes explained and synchronized to my Station inventory under my permissions and consent, so that I can keep my records current without treating ambiguous log activity as confirmed ownership.

### Scope and technical elaboration

Implement only STN-007-approved semantic change families. Add explicit normalized proposal contracts and deterministic qualification/correlation from canonical observations behind the runtime/renderer boundary. Preserve original event immutability; existing `stationSyncPolicy: never` data stays local. Review and approve only explicitly allowed minimized fields into a separate consent-controlled inventory operation contract; no generic bypass/export of local-only events. Unknown required identity, item mapping, quantity, baseline, outcome or ownership blocks submission with a reason. Owned-container moves do not increment totals. A review is user approval, not stronger log evidence. Approved proposals enqueue once via STN-008, retain stable review identity across updates and remain distinct from server-confirmed inventory. Pull/reconcile after application/conflict; never overwrite Station inventory or clamp invalid decrements. This story's reviewed workflow is provisional until D-06 is decided; if automation is selected, rescope before implementation rather than silently extending this issue.

### UI information and behavior

Show account/environment context, affected item name/ID, action, quantity/unit, source/destination or unknown, observation time, evidence provenance/confidence, qualification/withheld reason, review and sync status, and last confirmed Station revision. Authorized actions inspect the minimized outgoing payload, approve/reject under the agreed policy, pause/resume eligible sync, retry safely and reconcile conflicts. Required states include awaiting review, unsupported/withheld, unknown mapping/baseline, queued, sending, offline/stale, blocked by permission/auth/consent, applied, rejected, conflict and unknown outcome. A decline does not alter remote inventory. Use shared accessible detail behavior and design-approved focus, announcements, narrow layouts and state labels; raw evidence remains local/bounded.

### Non-goals; assumptions and risks

No unsupported sale/loss detector, silent rebase, generic canonical event upload, all-history backfill, automatic assertion, role administration or promise of authoritative game totals. Manual assertions/corrections need their own decided contract. Current purchase-friendly wording is not independent delivery proof.

### Acceptance criteria

- A qualifying action becomes one inspectable proposal with correct scope and uncertainty; unrelated/query/ambiguous events cause no mutation.
- Missing mapping/identity/baseline or permission/consent prevents submission with an understandable state.
- An approved permitted proposal creates one operation; confirmed inventory changes only after Station applies it.
- Failure, concurrent edit, withdrawal of access and unknown outcomes retain truthful review/recovery states.

### Happy-path test steps

Load a complete synthetic baseline, feed an accepted sanitized action fixture, review its minimized payload, approve, verify one server application and updated confirmed revision; replay the fixture and restart without another mutation.

### Unhappy-path test steps

Feed failed/duplicate/overlapping/incomplete operations, an unverified shop success, unknown quantities/IDs and owned-container moves. Revoke permission/consent, switch accounts, conflict a decrement and lose a response after commit. Verify no false inventory, data leak or duplicate; exercise keyboard/focus and narrow viewport recovery.

### Definition of Done

Approved action fixtures, domain/boundary/queue/UI tests, real Station contract verification, reviewed accessible designs and outgoing privacy review are complete. Documentation describes supported actions, omissions, consent, ownership and recovery. Monitoring/cache/queue performance, compatibility/migrations, `npm test`, relevant build and reviewable PR pass.

### Technology and libraries

Reuse Station catalog/inventory/auth/permission contracts, existing parser/contracts, encrypted persistence, queue and React/TypeScript renderer/test stack. New dependencies: **None expected**. No extraction tool or automatic rule engine is required merely because this story exists.
