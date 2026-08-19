# Annotated runtime capture findings — 2026-08-19

## Status and scope

This is the sanitized evidence ledger for one owner-observed Star Citizen `LIVE 4.9.188` play session. Four cumulative/copy-off log files were reviewed as fragments of the same game process, not as four independent sessions. One deliberate game stop and log deletion created an earlier source generation; the captures summarized here belong to the later generation unless stated otherwise.

The private logs remain ignored and must not be committed. This document records only minimized facts, counts, relative ordering, synthetic suffixes, and owner annotations needed to guide specifications and future fixtures.

## Session timeline

| Order | Direct log evidence | Owner annotation | Safe conclusion |
| --- | --- | --- | --- |
| 1 | PU join to shard suffix `_070` through a Replicant endpoint; hierarchy registration and territory setup complete | Login began at New Babbage on microTech; `r_displayinfo 3` showed DGS suffix `game-185` | One logical PU session began on shard `_070`; the overlay-only DGS label is not a `game.log` fact |
| 2 | Local RSI Meteor entity participates in ASOP spawn, targeting, route, arrival, and control records | Ship was retrieved in the hangar, entered, and flown | The correlated vehicle is the local player's retrieved and controlled vehicle for this interval; ownership is not proven |
| 3 | Quantum targets include an L2 station, Area18, then Orison; two final-destination arrivals are logged | The Area18 course was interrupted manually and redirected to Orison | Target selection and final arrival are directly observable; cancellation is annotation-only in this capture |
| 4 | Jurisdiction, monitored-space, and armistice notifications use the 4.9.188 quoted-message form | Player entered and left armistice; one later leave message appeared while still in the Orison area | These are client-observed announcements, not authoritative physical-position truth |
| 5 | No PU disconnect occurs while the shard remains `_070` | `r_displayinfo 3` changed from DGS suffix `game-185` to `game-11` above Crusader | A same-shard DGS/server change occurred from the player's perspective, but `game.log` does not expose a safe direct identifier for it |
| 6 | PU disconnect uses cause `30016` and a local `ExitToMenu` command | Player bed-logged after stopping quantum travel | Bed logout is indistinguishable from a normal menu exit in this evidence and must not be classified without another source |
| 7 | A second PU join occurs on shard suffix `_110`, with a different Replicant endpoint | Re-entry after bed logout placed the player on a new shard | One process/source generation can contain multiple sequential PU sessions and shard identities |
| 8 | Refuel-related subsystem activity is not an attributable transaction sequence | Hydrogen and quantum fuel were refueled after landing at Orison | Refuel completion remains unproven and requires a controlled retest |
| 9 | ASOP query, ship-elevator lowering/closing, and correlated RSI Meteor parent removal form a store sequence | The owner selected **Store** at the hangar ASOP terminal | RSI Meteor storage is supported by correlated direct evidence; vehicle ownership remains out of scope |
| 10 | Final PU disconnect is remote/player-requested cause `30016`, followed by clean process exit code `0` | Player exited the ship, rode the elevator to the spaceport terminals, and logged out normally | Normal logout and clean application exit are directly observable; passenger-elevator travel is not attributable from this capture |

## Build-specific vocabulary and lifecycle findings

- The 4.9.188 notification record is shaped as `Added notification "<message>" [<counter>] to queue`, rather than the older `NotificationId[...] Message[...]` fixture shape. Messages can end in a colon and participate in multi-line HUD lifecycle records.
- Reviewed notification additions include four monitored-space entries, two monitored-space exits, six armistice entries, five armistice exits, and jurisdiction observations for microTech, UEE, and Crusader Industries. Counts describe client announcements, not validated movement counts.
- `SC_Default` does not emit the previously required `OnClientEnteredGame` terminal in this capture. The repeatable ready sequence is `Loading GameModeRecord='SC_Default'`, game-mode creation, territory setup, then local-player game telemetry initialization. A profile may promote `PuEntered` only from a tested, bounded conjunction that excludes frontend initialization and incomplete loads.
- Both PU joins register a network hierarchy with `nodeCount=197018`, taking approximately 9.1 and 10.1 seconds. The count is diagnostic and must not be treated as shard population, DGS count, or proof of a topology.
- Frontend `Nub destroyed` disconnects with cause `30010` are transport-transition noise and must not terminate a PU session.
- Generic `NOT AUTH`, `Lost authority`, zone-host, and quantum `Server Rerouted` records are insufficient to identify the local player's DGS or assert an authority transfer.

## Product consequences

1. Separate source health, parser compatibility, observation age, and lifecycle state. A quiet append-only log does not disconnect a latched replication connection or make it unhealthy after 15 seconds.
2. Permit multiple PU sessions and shards within one process and one source generation. Preserve each historical session; never rewrite the first session with the second shard.
3. Treat `r_displayinfo` DGS labels as human annotations until a supported local capture source and privacy model are defined.
4. Add a vehicle projection that distinguishes hangar/retrieval state, aboard state, and control state. This capture promotes retrieval, control/release, quantum participation, and storage for a correlated vehicle; boarding and exiting remain evidence gaps.
5. Update the destination/travel evidence decision: local target selection and final arrival are now supportable for the correlated controlled vehicle. Route start, manual cancellation, interdiction, and failure remain deferred.
6. Preserve armistice and jurisdiction signals as observed announcements with timestamp, message, profile, confidence, and freshness. Do not claim exact location truth from them.
7. Keep bed logout classification unknown when its direct record is the same as a normal `ExitToMenu` sequence.

## Required fixture extraction

Only minimal, manually sanitized excerpts may enter the fixture corpus. Separate fixtures should cover:

- the 4.9.188 notification-add syntax plus multi-line/deduplication guards;
- the alternative `SC_Default` PU-ready sequence and incomplete-load negatives;
- two sequential PU sessions in one source generation;
- correlated RSI Meteor retrieval, control acquisition/release, and storage;
- local quantum target selection and final arrival, plus the annotation-only cancellation guard;
- normal logout versus bed logout ambiguity;
- same-shard overlay-reported DGS change with no promotable `game.log` event; and
- refuel and passenger-elevator unavailable-evidence annotations.

## Implementation backlog

- [#85 — Parse LIVE 4.9.188 notifications and alternative PU-ready lifecycle](https://github.com/Presstronic/astradock-local/issues/85)
- [#87 — Separate monitor health, activity age, compatibility, and latched lifecycle state](https://github.com/Presstronic/astradock-local/issues/87)
- [#89 — Add evidence-backed current vehicle lifecycle telemetry](https://github.com/Presstronic/astradock-local/issues/89)
- [#86 — Implement evidence-backed quantum target and final-arrival telemetry](https://github.com/Presstronic/astradock-local/issues/86)
- [#88 — Implement major.minor extraction-profile families with patch drift gates](https://github.com/Presstronic/astradock-local/issues/88)
- Existing [#70](https://github.com/Presstronic/astradock-local/issues/70) retains the broader server/shard transition capture effort, including direct evidence still missing for the overlay-observed same-shard DGS change.

## Privacy and retention

The source logs can contain handles, account and entity identifiers, endpoints, paths, session values, and detailed play activity. Raw files remain local and ignored. Future fixtures replace all such values with stable synthetic placeholders, retain only the minimum proving lines, and pass the existing fixture privacy scanner. The owner annotations in this ledger must not be used as `observed` event payloads; any correlated conclusion is `inferred` and cites contributing observations.
