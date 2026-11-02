# New-patch preview log capture script

Use this checklist after each new **PTU, EPTU, HOTFIX or TECH-PREVIEW** patch. Run it separately for each channel and exact build you want to evaluate. The output is an annotated private capture, a comparison against a named LIVE baseline, and a reviewed commit containing only sanitized evidence and justified parser changes.

**Operator:** follow steps 1–6 during testing. **Developer:** use steps 7–8 to analyze the delta and prepare the commit. Step 9 defines the handoff; optional modules can be skipped with an explicit reason.

**LIVE remains the source of truth. Never copy, rename, link or concatenate preview logs into the LIVE installation or its logbackups.** Read each environment's original log in place. Private capture copies belong outside all game installations and outside the repository. Compare them as separate sources; never make a preview file pretend to be LIVE.

This is a human gameplay script and developer handoff, not a new automatic recorder or diff tool. The original `Game.log` is the evidence source. The overlay is a diagnostic display of a curated subset; an empty overlay does not establish an empty log. No step authorizes Station synchronization, account/inventory changes in Station, a new detector or a PR merge.

## 1. Prepare the run

- [ ] Read the [runtime observation catalog](runtime-observation-catalog.md), the last ledger for this channel, and the [profile compatibility policy](runtime-profile-compatibility-policy.md). Identify previously missing signals you want to retest.
- [ ] Name a **LIVE baseline**: its exact channel/build/branch/locale, capture date, action IDs, sanitized fixtures and the repository commit that accepted them. Use the latest reviewed, comparable evidence; do not assume the largest registered build number covers every capability.
- [ ] Also name the previous accepted build of this preview channel, if available. Keep **LIVE versus preview** and **previous preview versus new preview** as separate comparisons.
- [ ] If an action has no comparable LIVE evidence, mark its baseline `missing`. Capture it anyway, but classify the result as new preview evidence, not a proven change from LIVE. A fresh LIVE baseline, if needed, is a separately labeled run against the real LIVE installation; it is never manufactured from preview logs.
- [ ] Finish updating the chosen preview channel, then close the launcher/game before the initial metadata check. Keep LIVE closed and unchanged during the preview run. Do not update the game or AstraDock halfway through a run.
- [ ] Prepare a quiet, repeatable location; a backpack/container, a few inexpensive items, a small stack, a drink, and access to a shop if available. Use existing gear. Ship/party/mission tests below are optional extensions.
- [ ] Keep a private notes file outside the repository. Use UTC timestamps. Check that the system clock/timezone is correct; record any known source-clock offset instead of rewriting original log timestamps.
- [ ] Allocate about 30–45 minutes for the core run, plus travel/setup time. Repeat the key inventory tests in a second session. A patch without accessible shops, containers or a usable character can still yield an explicitly incomplete capture.

Use a unique ID such as `CAP-YYYY-MM-DD-PTU-01`; increment the final number for each new session. Do not reuse an ID after a crash, patch change or restart that creates a different source generation. Archive each run before launching the next one.

### Capture cover sheet — fill this in before play

```text
Capture ID:
Date / operator alias (no account ID):
Channel: PTU | EPTU | HOTFIX | TECH-PREVIEW
Game executable FileVersion:
ProductVersion / game version:
Launcher build/changelist (if available):
Branch / environment / universe:
Game language / locale:
Logging configuration / verbosity (default or known settings; do not guess):
OS / Wine-Proton version if applicable:
AstraDock version and Git commit / artifact ID:
Parser profile ID + version, or unsupported / unknown:
Main monitor status / overlay status / filter selections:
LIVE baseline capture ID + exact build + accepted commit:
Previous same-channel capture ID + exact build + accepted commit:
Planned action IDs / unavailable setup:
UTC run start:
UTC run end:
Clock offset or uncertainty:
Original log location (PRIVATE notes only):
Source files / rotation or restart notes:
Archive filenames + SHA-256 (fill in after shutdown):
Completeness: complete | partial | interrupted | invalid
```

Keep executable version strings and numeric launcher build IDs in separate fields. Record the values actually observed in the log/header; do not substitute a version inferred from a folder name. If launcher and log disagree, record both and resolve the mismatch before claiming build compatibility.

## 2. Start collection in the correct environment

1. Start or restart the updated AstraDock **before launching the game**. Record its UTC start time. Do not assume a previously running process loaded newly changed parser code.
2. In the RSI Launcher, select the intended preview channel and launch that installation. Record launch time. If the new `Game.log` does not exist yet, wait for the game to create it; do not select LIVE as a substitute.
3. In AstraDock, choose that channel's original `Game.log` using the Environment selector or explicit source chooser. Verify channel, executable version/build and source details against the cover sheet. A channel/folder mismatch is a stop condition, not a reason to move or edit the file.
4. Select **Open event overlay**. It starts follow for the selected valid source if stopped. Verify the main monitor is following that source. **Every environment switch stops follow**: open the overlay or choose Start follow again after switching, even if the overlay window is already visible.
5. Set overlay filters to **Show all types** and record that setting. Friendly and Raw show the same curated events; Raw is not a full-log viewer or a sanitized export. Leave unrelated app settings and Station configuration alone.
6. Record parser status. `unsupported_profile`, `unverified_build` or “Unsupported/Unverified build” is useful evidence: continue the gameplay script if the game is usable and its original log is updating. Do not change an allowlist or force a LIVE profile to make the overlay populate.
7. Check that the original preview log's size/last-write time advances during startup. Inspect its header locally if necessary. If the source is missing, unreadable, the wrong channel, or not updating during expected startup activity, fix the collection problem before judging parser behavior. Quiet gameplay alone is not proof of a dead collector.

The overlay only considers observations since this AstraDock launch and within its bounded recent window. It can omit query traffic, repeated completion echoes, system/debug records and unsupported patterns. Keep the original log even when Friendly/Raw displays nothing. If capture is truncated or a rapid log burst exceeds the recent window, record the gap; use the privately archived source for later analysis.

## 3. Record actions as you perform them

Say or write the action ID and UTC start time **before** each action; record the end time and the visible outcome immediately afterward. A private recording can help timing, but redact it before sharing. Do one action at a time. Let the UI settle, then wait about 10 seconds before the next action. If an operation is still pending, wait or mark it pending; do not overlap it just to keep the schedule.

For repeatable steps, use suffixes such as `INV-02a` and `INV-02b`. A reverse transfer is a different direction, not automatically a repeat of the original. Record source/destination and item/quantity each time. If the exact setup is unavailable in this build, write `blocked` or `not exercised` with the reason instead of replacing it with a different action under the same ID.

### Action ledger — copy one row per attempt

| Action ID / attempt | Start UTC | End UTC | Exact action and context | Before → after seen in game | Owner outcome | AstraDock / overlay observation | Source evidence reference / uncertainty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INV-02a | YYYY-MM-DDTHH:mm:ss.sssZ | YYYY-MM-DDTHH:mm:ss.sssZ | One item, container A → B | A: 2 → 1; B: 0 → 1 | succeeded | Empty / visible label / unsupported | Fill during later log review; do not guess a request ID |

Use owner outcomes `succeeded`, `failed`, `cancelled before submit`, `pending`, `unknown`, `blocked`, or `not exercised`. Record an unexpected result or correction as another note; do not silently rewrite the original observation. A UI result is owner ground truth for this exercise; it is not proof that a particular log record detects it.

To obtain a UTC timestamp in PowerShell:

```powershell
[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
```

## 4. Core gameplay script — run every patch where available

Keep the same action IDs, order, locale and comparable setup across captures. Record environmental differences that you cannot control, such as location, server/session, gear, item class or UI changes. Use the current game's normal controls; missing or changed controls are a finding, not a reason to invent an equivalent log signal.

| ID | Follow these steps | Record / comparison purpose |
| --- | --- | --- |
| BOOT-01 | Remain in the frontend for 30 seconds without opening inventory or making a purchase. | Quiet/frontend negative control. Startup, preloading and service records must not become gameplay transactions. |
| JOIN-01 | Enter the PU and wait until your character is controllable. Do not combine this with party launch. | Separate login, join request, loading, replication connection and ready/controllable times. Record only server/shard information actually shown; keep sensitive details private. |
| IDLE-01 | Stand still for 30 seconds with inventory and shops closed. | In-game background traffic. Avoid treating periodic queries as user actions or repeated acquisitions. |
| INV-01 | Open inventory, inspect it for 10 seconds, then close it without moving or using anything. Repeat once. | UI opening/closing and query-only negative control. No owned quantity should change. |
| INV-02 | Move exactly one inexpensive item from container A to B. Wait for settlement. Move it back as a separately timed action. Repeat the A → B transfer once. | Direction, displayed container names, item class/name, quantity before/after, pending state and result. Distinguish move intent, processing, result and UI echoes. |
| INV-03 | If stack transfer is supported, move exactly two units of the same item as a separate action; record the reverse transfer separately. | Quantity/split-stack behavior. Record unavailable controls rather than guessing whether a request means one or several items. |
| HAND-01 | Move one item to a hand, wait, then return it to a container. Repeat the hand action once. If a helmet hook is available, use it in a separately timed substep. | Item, left/right hand or hook, and visible equipped/held state. Attachment, pocket insertion and actual acquisition are different observations. |
| DROP-01 | Drop one inexpensive container item to the ground using the game's ordinary inventory action. Observe it, then retrieve it as a separate action if possible. | Exact quantity, source, visible ground item, recovery and any failure. A drop request alone does not prove completion or inventory loss. |
| USE-01 | With a drink that has a visible fullness value, note the value, drink, and record the resulting value. Separately stow/drop/throw the held item only if the normal controls allow it. | Fullness and consumption are owner observations. Distinguish a held-item throw from an inventory ground-drop. If no fullness value or log signal exists, say so. |
| SHOP-01 | Open a shop/kiosk, inspect or select an item, then leave without submitting a purchase. | Shop/query negative control. Selection or leaving the UI must not be counted as a purchase. |
| SHOP-02 | Buy one inexpensive item with quantity 1; wait for the visible result and inspect inventory. Repeat once after settlement. If practical, make a third purchase of quantity 2. | Requested item/quantity, shop/kiosk context, displayed unit/line price and currency, balance before/after if visible, result and delivered quantity if inspectable. Treat unavailable values as unknown. A shop success does not independently prove wallet debit or delivery. |
| CANCEL-01 | Begin an ordinary inventory drag or shop selection, then cancel before submitting it using supported controls. Do not intentionally disconnect or corrupt files. | A pre-submit cancellation can legitimately have no operation/failure record. If a submitted operation naturally fails, give that attempt its own ID and record the exact UI result. |
| IDLE-02 | Wait 30 seconds after the last completed action without repeating it. | Delayed responses, duplicate echoes and periodic refreshes. One physical action must not become several changes merely because several records appear. |
| EXIT-01 | Return to the frontend using the normal game menu; wait 15 seconds, then cleanly exit the game. | Frontend return, PU disconnect and process exit are separate events. Record their actual order and any missing records. |

**Second-session check:** archive this run first. Start a new capture ID on the same preview build; repeat BOOT-01, JOIN-01, INV-01, INV-02 and EXIT-01. A new request-ID sequence or reused entity/session labels must not correlate to the prior source generation. If another session is unavailable, explicitly leave cross-session repeatability untested.

## 5. Extended modules — run when relevant to the patch

Do these before EXIT-01, or in separately identified sessions. These are evidence-gathering exercises, not claims that AstraDock already supports the resulting features. Mark every omitted module `not exercised`; do not report it as passing.

| ID | Controlled steps | Distinctions to preserve |
| --- | --- | --- |
| SELL-01 | If selling is supported and suitable, sell one inexpensive item and inspect the visible item/balance result. | Sell request versus success, exact quantity, proceeds and actual UI change; not a negative purchase. |
| VEH-01 | Query your existing ship list without retrieving. Then retrieve one existing ship; record when it appears. | List queries and hangar aggregates versus retrieval; no new ship purchase is required. |
| VEH-02 | Approach/board the ship; enter the pilot seat; leave the seat; later store the ship through supported controls. Time each separately. | Boarding, local control acquisition/release, storage tracking and successful storage are not interchangeable. Record the observed ship, not an assumed ownership relationship. |
| NAV-01 | Select destination A, change to B, then perform one normal quantum trip if available. | Target selection/change, travel start and final arrival. A place name, route query or nearby entity is not arrival evidence. |
| ZONE-01 | On an ordinary route, observe entry/exit of armistice or monitored space where the game exposes it. | Visible jurisdiction/state and timing. Unknown is not false; do not assume exact coordinates or invent an unavailable boundary crossing. |
| PARTY-01 | With a willing helper, create a party, invite/join, change leader if supported, and leave. Keep solo login and party launch separate. | Request, connected/accepted membership, leader and leave; communication-range changes do not establish membership. Redact the helper's identifiers too. |
| MISSION-01 | Inspect a mission without accepting, then accept a suitable mission. If feasible, complete one and abandon another, each as separate actions. | Browsing, sharing, acceptance, completion, abandonment and reward; no payout inference from a title/notification alone. |
| RECOVERY-01 | After archiving a normal session, start another game session to observe natural log replacement/rotation. Optionally restart AstraDock during otherwise stable gameplay, then perform one new inventory action. | New source generation, launch-time cutoff, duplicate suppression and unknown/last-confirmed state. Do not edit, truncate or rename the real game log to manufacture rotation. |
| FAILURE-01 | Record a naturally occurring timeout, server error, failed interaction or interruption, including the visible state afterward. | Distinguish local app failure, source-read failure, game/server failure and unknown outcome. Deliberate crashes, account changes or network disruption are not required. |

## 6. End and preserve the private capture

- [ ] Write the UTC end time and any incomplete/pending steps. Cleanly close the game and wait for final log writes to settle.
- [ ] Preserve the original `Game.log` and only the related `logbackups` files needed to cover this run, especially if rotation occurred. Keep each file's original identity/name in private notes; do not concatenate files or mix builds/channels.
- [ ] Copy them to a **new private archive directory outside the repository and every game installation**, organized by channel, exact build and capture ID. Keep the action ledger beside them. Do not overwrite a prior capture.
- [ ] Record source size, last-write UTC, SHA-256, archive name and any gaps. Verify each archive copy matches its closed/stable source. An active/incomplete copy is labeled partial and is not a complete-session baseline.
- [ ] Preserve a stable reviewed LIVE baseline separately. Preview capture copies never go into LIVE, its backups, a LIVE-named capture directory, or LIVE fixture paths. If you elected to hash the closed LIVE source before/after the exercise, record any unexpected change and investigate its cause.
- [ ] Keep full logs, private path mappings and private recordings local. Send the developer the capture ID, channel/build and action ledger, with private source access only through the agreed local workflow. An overlay screenshot or normalized summary alone is insufficient raw evidence.

For a file hash on Windows, enter the **original preview file path** when prompted, after closing the game. This command only reads the file; repeat it on the archive copy and compare the hashes:

```powershell
$captureSourcePath = Read-Host 'Full path of the closed preview Game.log (or its private archive copy)'
Get-FileHash -LiteralPath $captureSourcePath -Algorithm SHA256
```

Do not paste the command output into a public issue unchanged: it includes the local path. Record only the approved filename/capture alias and hash in a shareable manifest. Linux users can obtain the equivalent SHA-256 with their normal local tooling.

## 7. Developer pass: compute the delta without contaminating LIVE

The operator can hand off after step 6. The developer performs the following using separate, read-only source references and the accepted [fixture/sanitization standard](runtime-log-fixture-corpus.md). No general automatic patch-diff CLI is implied by this document.

1. **Validate provenance first.** Match channel, exact executable build, branch, locale, timestamps, source generation and hashes to the ledger. Keep original evidence coordinates per file. Mark missing files, time gaps, truncation, partial lines, mismatched build metadata and interrupted sessions explicitly.
2. **Inventory before filtering.** Enumerate observed record tags/levels, field keys/types, result/operation enums and their counts. Inspect relevant unknown records and nearby intent/result context, not just events the current parser recognizes. Separately count successful reads, framed records, parser-recognized events and curated overlay rows.
3. **Align actions, not whole files.** Compare matching action IDs and before/after outcomes against the named LIVE baseline, then separately against the previous preview build. A whole-file text diff is dominated by clocks, IDs and background traffic; it is not a semantic change report.
4. **Make sanitized comparison views.** Replace variable private identities using stable, namespace-specific placeholders while retaining correlation, marker spelling/case, severity, quoting, delimiters, field names/order, value types, units, enum values, missing/null fields, multi-line structure and line endings. Preserve source and ingestion times separately and retain original file order; do not sort away a changed sequence or mix source generations. Normalization is a comparison aid, never a rewrite of original evidence. Flag an ordering/line-ending change rather than normalizing it away. Compare logging configuration too; changed verbosity is not automatically a removed gameplay signal.
5. **Separate kind of delta from confidence.** Classify marker/field additions, renames, shape changes, ordering, multiplicity, correlation/ID reuse, severity, or semantics only to the extent evidence supports them. A field called Store is not automatically a vehicle-store or ownership transition. Preserve contradictory examples.
6. **Investigate silence.** Distinguish action not performed, unsupported game UI, unreadable/incomplete capture, parser rejection, query/echo curation, filter exclusion and no identified signal. After a repeated successful action with complete surrounding source evidence, write `not observed in these captures`; do not declare permanent signal removal or reliable absence detection.
7. **Review every distinct finding.** Update a dated `docs/runtime-capture-findings-YYYY-MM-DD-<channel>.md` ledger and append/index it in the [runtime observation catalog](runtime-observation-catalog.md). Include unchanged observations, corrections, unknown patterns, bounded inferences and owner-confirmed actions with no identified log signal. Do not replace prior LIVE conclusions or leave findings only in chat.

### Delta matrix — one row per signal or actionable gap

| Action / signal ID | LIVE baseline build + evidence | Previous preview build + evidence | New channel/build + evidence | Delta class | Evidence and repeatability | Behavior decision / tests |
| --- | --- | --- | --- | --- | --- | --- |
| INV-04 / INV-02a,b | Baseline marker/fields or missing | Prior marker/fields or unavailable | Result marker, fields, source references | unchanged / added / renamed / field shape / order / duplicate / correlation / severity / semantic candidate / not observed / untested / capture gap | observed once / repeated within session / separate-session evidence; owner action separate | Support exact build, add adapter, keep blocked, or collect more evidence |

For each changed/added/absent field, describe its meaning, type, unit/precision, nullable/unknown behavior and sensitive-value handling. Record counts for **physical records**, **normalized observations** and **visible/derived rows** separately. A result and completion echo can be two real log records representing one gameplay action; a deduplication change is not automatically a gameplay-count change.

## 8. Turn accepted evidence into a code commit

- [ ] Create an intentional branch for this channel/build, for example `fix/ptu-<build>-log-compatibility`. Keep unrelated owner worktree changes untouched. If no justified runtime change exists, deliver an evidence-only documentation/fixture commit and state the remaining blocker.
- [ ] Add the smallest representative sanitized snippets under the appropriate **preview** subtree of `test/fixtures/runtime-log/`, each with a sibling `.manifest.json`. Use the current corpus naming/manifest contract. If adding a new channel/profile identifier, extend the fixture validator deliberately rather than disabling validation.
- [ ] Preserve unchanged LIVE fixtures and frozen expectations. Include the changed preview happy path, a relevant negative/unhappy path, repeated operations/echoes and a comparable LIVE regression. Expected payloads are reviewed against evidence, not automatically accepted because the new parser generated them.
- [ ] Make the narrowest justified profile/extractor change. An exact new tested build is accepted only after its marker/field/semantic evidence is reviewed. Keep explicit exclusions, unsupported/unverified states and per-family drift handling. A matching major/minor version or identical-looking text does not approve another channel/build or every event family.
- [ ] Keep new semantics behind the [versioned event contract](runtime-event-contracts.md). Do not invent wallet debit, delivery, consumption, acquisition, loss, ownership, vehicle storage or Station writes from requests, UI refreshes, generic attachments or missing records.
- [ ] Test channel/build/branch isolation, wrong-build rejection, malformed/missing fields, request-ID reuse across sessions, conflicting evidence, duplicate delivery, interrupted/partial lines and the relevant CRLF/chunk boundary cases. Reuse existing coverage when unchanged; add focused fixtures/tests for each parser change.
- [ ] For overlay-visible changes, verify curated inclusion/exclusion, newest-first ordering, Friendly/Raw equivalence, raw-evidence bounds, inert text rendering and actionable unsupported/unverified status. Verify a source switch clears old data, stops follow, and opening the overlay starts only the selected source. Test after the app's launch cutoff, not by replaying history as live.
- [ ] Replay sanitized LIVE and preview fixtures into separate environment keys. Confirm preview events, correlations, checkpoints and projections cannot enter LIVE; do not relabel historical UNKNOWN rows or broaden LIVE's profile to pass a preview test.
- [ ] Update the dated ledger, catalog, compatibility policy and any affected event/message references or user instructions. Record unresolved capabilities, compatibility/migration effects and technology changes; use `None` when no dependency/tool change is needed. This runbook introduces no dependency.
- [ ] Run appropriate verification. For parser/profile changes, the current baseline commands are below; add focused benchmarks or platform checks when performance, tailing, persistence or packaging changed. Do not weaken assertions, remove failing fixtures or silently skip a platform to obtain a pass.

From the repository root on Windows:

```powershell
npm.cmd test
npm.cmd run build:renderer
npm.cmd run security:check
npm.cmd run docs:check
git diff --check
```

On other platforms, use the corresponding `npm` commands. Record the commands, results and real platform skips. Synthetic fixtures demonstrate parser behavior; they do not establish cross-session gameplay reliability.

- [ ] Review the exact staged files/diff for secrets, real IDs, endpoints, private paths, full logs, recordings and game assets. Stage explicit paths; do not use a blanket add over a worktree containing capture material.
- [ ] Commit the sanitized evidence, tests, implementation and documentation together, or as a clearly explained evidence → implementation commit pair. Name the exact channel/build, the observed delta, behavior retained/changed, verification and outstanding evidence limits in the commit/PR description.
- [ ] Open a reviewable PR with motivation, scope, compatibility/privacy/performance notes, verification and synthetic UI images when applicable. **Never merge without explicit owner permission. Do not watch/poll PRs or CI runs unless the owner requests it.** Describe local results and leave remote check status to the owner/reviewer.

### Commit/handoff template

```text
Title: fix: adapt <channel> <exact-build> <event-family> log parsing

Capture: <ID>; locale/branch; complete or explicitly partial
LIVE baseline: <capture/build/accepted commit>
Previous preview baseline: <capture/build/commit or unavailable>
Observed delta: <markers, fields, sequence/correlation, unknowns>
Accepted behavior: <exact supported build/channel/families and limitations>
Evidence: <sanitized fixture + manifest paths and ledger>
Isolation: <LIVE unchanged; preview keys distinct; raw logs remain private>
Verification: <commands + outcomes + platform skips>
Technology and libraries: None | <reviewed change and reason>
Compatibility/migration: <effect or none>
Follow-ups: <missing actions, unsupported families, repeatability gaps>
```

## 9. Run completion check

A run is useful when its channel/build and private source provenance are unambiguous, performed/skipped actions are honestly annotated, and someone can map each claimed difference to evidence. A full patch-compatibility handoff additionally has a named LIVE baseline (or an explicit baseline gap), the delta matrix, sanitized regression fixtures, updated ledger/catalog and a reviewable commit. Unsupported actions, missing records and no-change outcomes are valid findings; they must not be converted into invented detectors or “all preview supported” claims.
