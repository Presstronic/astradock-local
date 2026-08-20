# Runtime Monitor party section

## Purpose

The Party section presents the active environment's evidence-backed `PartySnapshot` as local runtime telemetry. It is a live status surface, not a reconstructed social roster or party-history feature.

## Information contract

- Overall state is one of **In party**, **Not in party**, **Unknown**, **Stale**, or **Unsupported**. **Not in party** appears only after promoted terminal evidence; an absent roster never implies an empty party.
- Confirmed and possible member counts remain separate non-negative integers. Possible members are qualified observations and never increase the confirmed count.
- Each known member displays the sanitized handle, confirmed/possible/stale membership, connected/disconnected/stale/unknown connection state, the latest promoted transition, confidence, and compact freshness. Exact localized and ISO time is available from the timestamp title/accessible context.
- **Leader** appears only when the projection's leader fact is known. The local player is identified as **You** only when local attribution is present in the projection.
- Recent changes are ordered by the projection and link by immutable evidence event ID to the shared event drilldown. When the event is no longer retained, the drilldown shows an explicit retention-removed state instead of redirecting to unrelated evidence.
- Stable party IDs and raw log context are omitted from the default surface. Permitted evidence remains available only through the existing local detail boundary.

## State behavior

- **Unknown:** no promoted lifecycle evidence establishes the current party state. This includes monitoring that begins mid-party.
- **Unsupported:** the active parser profile or build cannot safely interpret party evidence.
- **Not in party:** direct promoted leave/no-party evidence exists. This is the only confirmed-empty presentation.
- **In party:** direct promoted creation/join evidence establishes local membership. Confirmed and possible members remain visibly qualified.
- **Stale:** last-confirmed party facts are retained with stale qualification and their last evidence time; they are not silently converted to current facts or false values.
- **Error/disconnected/loading:** workspace-level monitor messaging remains authoritative while the Party section preserves the last safe snapshot or shows Unknown when none exists.

## Interaction and accessibility

Roster rows and recent-change rows are native keyboard-focusable buttons. Selection opens the same shared evidence drilldown used by the event stream and focus returns to the triggering row when the drilldown closes. Handles truncate visually but remain available to assistive technology and via the native title.

Meaningful party changes receive one concise polite live-region announcement after initial hydration. Initial replay is not announced, avoiding duplicate notification echoes. State, membership, connection, leader, confidence, and freshness are always expressed in text rather than color alone.

## Evidence limitations

The provisional `sc-4.9-live` profile promotes only explicit local creation/leave, launch, and named connection evidence. A named connection can establish possible membership and connection state but not a proven join. Marker observations do not create or remove members, determine roster size, assign leadership, or establish an empty party. Other-member leave, reconnect, kick, leader transfer, disband, and mid-party reconstruction remain unsupported until the evidence gate promotes them.

All social telemetry remains on the device. Any future Station synchronization requires a separate consent, minimization, retention, and deletion contract.
