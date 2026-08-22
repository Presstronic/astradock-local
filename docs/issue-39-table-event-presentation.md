# Issue 39: Structured Table event presentation

Table is a presentation of the shared Runtime Monitor event stream. It does
not subscribe to the monitor independently, create a second event collection,
or derive selection from row position. The shared stream supplies the bounded
ordered window and the immutable `eventId`; the existing shared drilldown
loads permitted evidence for the selected event.

## Display contract

The default order is the shared stream's newest-first chronological order. The
table intentionally does not introduce a separate sort control, so live
semantics remain unambiguous. Browse controls and `Return to live` are shared
with Terminal. The six columns are:

| Column | Meaning and formatting |
| --- | --- |
| Kind | Human-readable event-kind label with a non-color kind cue. |
| Severity | Routine, Notice, Urgent, or Critical; text and symbol are always present. |
| Summary | Bounded normalized summary; never raw log content or interpreted markup. |
| Attributes | Provenance plus confidence qualification. |
| Shard | Sanitized shard name, ID, or region when available; otherwise context or `Unknown shard`. |
| Age | Relative event age; the exact event time remains available as a title and accessible label. |

Sensitive identifiers, endpoints, source paths, and raw evidence remain in the
permitted detail boundary. Unknown, missing, and malformed values use explicit
fallback text. The render window remains bounded by the shared stream's
maximum rather than an unbounded DOM list.

## Interaction and accessibility

The table uses native table headers and rows inside a keyboard-operable grid.
Rows are focusable by immutable event ID. Arrow Up/Down, Home, End, Enter, and
Space support navigation and selection; selection opens the shared detail dock
and remains valid when new events arrive, the query changes, or the user
switches to Terminal. The table exposes its row count, active row, selected
state, column labels, exact event time, and complete row summary to assistive
technology.

Attributes and shard columns are lower priority at narrow supported widths and
may be hidden by responsive rules. Their information remains available in the
detail dock, which retains all permitted fields. Row density continues to use
the persisted 22/31/38px settings, with Table defaulting to 31px. The Table
detail dock defaults to the bottom placement established by issue 37.

## States and verification

The shared stream status communicates live, browsing, paused, stale,
disconnected, replay, matching count, unseen count, and recovery controls.
The table distinguishes no telemetry from no matching telemetry and inherits
the shared loading and error surfaces. A selected row that leaves the visible
window keeps its immutable detail snapshot and receives the existing
availability/tombstone behavior.

`test/tableEventFormat.test.ts` covers semantic labels, provenance and
confidence, exact-time context, missing values, control-character sanitization,
and bounded display text. The existing design-contract tests cover the locked
typography and token behavior; the full repository command is `npm test`.

Technology and libraries: None. The implementation uses the existing React and
TypeScript renderer, native table semantics, shared event stream model, and
shared evidence drilldown.
