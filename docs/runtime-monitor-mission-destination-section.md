# Runtime Monitor Mission / destination section

## Purpose

The Mission / destination section keeps two evidence capabilities visibly separate: local-player mission lifecycle and locally correlated quantum destination/travel observations. A missing signal is never presented as a confirmed empty set.

## Information contract

- Mission displays **Unsupported** for the current profile because issue #10 promoted no mission lifecycle events. Generic `MissionId`, notification lifecycle, tutorial, startup, and asset records never alter the section.
- Destination/travel displays the raw sanitized target label, canonical state, latest promoted transition, confidence, and freshness only for fixture-approved local-vehicle correlations.
- Supported destination states are **Target selected**, **Arrived**, **Unknown**, and **Stale**. **Unsupported** applies to incompatible or unverified profiles. No destination is never claimed unless future authoritative empty-state evidence is promoted.
- No friendly destination name, progress value, travel-start state, cancellation, failure, or mission outcome is inferred.
- The latest supported destination transition links by immutable evidence event ID to the shared local evidence drilldown. Retention removal produces an explicit fallback rather than redirecting to unrelated evidence.

## State and lifecycle behavior

Loading or absent scan data displays Unknown/Unavailable without making empty-state claims. Fatal initialization displays Error. An incompatible or unverified parser profile displays Unsupported for both capabilities. Session boundaries stale previous destination evidence; environment partitions never share state.

## Interaction and accessibility

The destination transition is a native keyboard-focusable button. Selection uses the shared drilldown, whose close action restores focus to the trigger. Labels, states, freshness, confidence, and limitations are expressed in text, with exact localized and ISO time available as timestamp context. New destination transitions receive one concise polite live-region announcement after initial hydration.

## Privacy and evidence limitations

Only sanitized projection fields appear in the section. Stable vehicle identity and raw log context remain behind the permitted local evidence boundary. Raw telemetry remains on-device, and Station synchronization is outside this issue.

## Technology and libraries

None. The section uses the existing React renderer, projection DTOs, shared drilldown, time contract, semantic tokens, and accessibility conventions.
