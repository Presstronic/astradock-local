# Issue 36: Shared event filters, alert lifecycle, and attention controls

## MVP contract

The Runtime Monitor has one bounded query model shared by Terminal and Table views. A query is always scoped to the active environment and may combine literal search, session, event kind, shard, server, party context, provenance, confidence, and diagnostic visibility. Search is literal, capped at 160 characters, and never interpreted as a regular expression or executable expression. Empty results must distinguish no telemetry from no matches.

Controls use human-readable labels and expose their result set through a polite status announcement. Filter changes reset the browsing window while preserving the selected event only when it remains in scope. The query is local-only; no filter state is sent to Station. Preferences are not persisted unless explicitly added to the approved local settings contract.

## Alert lifecycle

Alerts represent semantic conditions or transitions, not matching physical log lines. Their stable identity is the condition/transition key. The lifecycle model keeps one active alert per key, records a cleared state when the condition disappears, and retains only a bounded history for the local session. Alert content includes severity, concise title/message, lifetime, state, reason where available, and an optional supporting event ID. Urgency is independent of event kind and must not be conveyed by color alone.

Persistent conditions include source loss, monitor degradation, storage failure, parser drift, unsupported build, and fatal initialization failure. Action failures are transient. Cleared conditions leave the attention region and remain available as historical context; transient presentation expiry does not recreate an alert while its semantic condition remains unchanged. OS and Station notifications, user-authored rules, and alerting on every physical line are outside MVP.

## Information architecture and accessibility

The attention region appears adjacent to the shared stream and is bounded to prevent flooding. Each item exposes severity, title, message, current state, and timing semantics to assistive technology. Critical items use an alert announcement; non-critical updates use polite status announcements. Focus and pointer pause transient expiry. Filter controls have explicit labels, keyboard operation, bounded input, and a result-count status. Unknown, unsupported, disconnected, stale, and no-telemetry states remain distinct.

## Verification

Happy path: combine filters, switch between Terminal and Table, verify identical event IDs and counts, trigger a semantic condition, observe one alert, follow its evidence event, then clear it and confirm deterministic removal/history.

Unhappy path: use empty, oversized, and special-character searches; conflicting filters; rapid changes; duplicate events; late clears; unsupported domains; reconnects; and alert bursts. Confirm literal bounded matching, environment isolation, no duplicate active alerts, accessible announcements, and no unbounded rendering work.

## Technology and libraries

None. The implementation uses the existing TypeScript/React UI and built-in controls; no search, debounce, notification, or state-management dependency is added.
