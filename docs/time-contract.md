# Telemetry Time Contract

## Status and purpose

| Field | Value |
| --- | --- |
| Status | MVP application contract |
| Decision issue | [#99](https://github.com/Presstronic/astradock-local/issues/99) |
| Shared runtime implementation | [`src/time.js`](../src/time.js) |
| Renderer boundary | [`src/renderer/src/time.ts`](../src/renderer/src/time.ts) |

This contract gives runtime observations one deterministic meaning across parsing, correlation, persistence, replay, ordering, and display. It prevents a source timestamp from changing meaning with the computer's locale or time zone.

## Terms and invariants

- **Source time** is the instant written by Star Citizen in a log record. A supported source time must include `Z` or a numeric `±HH:mm` offset.
- **Canonical event time** is source time normalized to UTC ISO 8601 with millisecond precision: `YYYY-MM-DDTHH:mm:ss.sssZ`.
- **Ingestion time** is AstraDock's UTC clock reading when it accepts an observation. It is provenance, not a substitute for an absent or ambiguous source time.
- **Display time** is a canonical instant formatted in the user's current local time zone at the renderer boundary.
- **Elapsed time** is the difference between parsed absolute instants. It is never calculated from displayed wall-clock strings.
- **Ordering** compares parsed absolute instants first and uses documented sequence/offset/identity tie-breakers. Lexical display strings and host-local parsing are forbidden ordering inputs.

The current Star Citizen profiles require an absolute source timestamp. Offset-less input is ambiguous and is rejected unless a future source profile explicitly declares its basis. The shared parser can apply an explicit UTC policy, records that assumption in its structured result, and does not apply it by default.

## Accepted source syntax and failures

`src/time.js` accepts strict ISO 8601 calendar instants containing `T`, optional fractional seconds, and a required `Z` or numeric offset. It validates calendar fields before using the platform date implementation and normalizes valid values to UTC milliseconds.

Parsing returns a structured success or a privacy-safe failure code:

- `timestamp_missing`: no timestamp is present.
- `timestamp_ambiguous`: the value resembles a timestamp but has no offset.
- `timestamp_malformed`: syntax, offset, clock, or calendar fields are invalid.

Parser integrations do not coerce these failures to the Unix epoch, the current time, an environment observation time, or a guessed local zone. A matched event with invalid time is withheld from the canonical stream, diagnosed without raw evidence, and retained through the bounded unknown-evidence path. Legacy environment scanning similarly reports the condition and keeps the timestamp unknown.

## Display and accessibility

The renderer formats valid instants with cached `Intl.DateTimeFormat` instances. Compact stream rows show local `HH:mm:ss` for scanability. Hover/focus accessibility text and the shared detail view expose the complete local date, local numeric UTC offset, and canonical UTC value. Invalid or absent instants display `UNKNOWN`; they never appear as 1970 or as an apparently valid local time.

The display boundary is the only place where a user locale or time zone may change presentation. Changing the operating-system time zone can change displayed wall-clock text, but cannot change event identity, persistence, correlation, freshness, duration, or order.

## Ordering and duration rules

- Canonical runtime events retain the `runtime-event/v1` total order: event instant, ingestion sequence, source generation, source byte offset, then event ID.
- The combined live Terminal/Table projection orders by event instant, source line, then stable ID so Zone, Navigation, Vehicle, shard, and action rows share one chronology.
- Duration and freshness calculations use epoch milliseconds returned by the strict parser. DST gaps and repeated wall-clock hours therefore have their correct elapsed duration.
- Invalid timestamps sort through the caller's explicit unknown-state policy; central helpers return `null` instead of inventing an instant.

## Persistence and compatibility

Canonical persisted events already require normalized UTC millisecond timestamps. The persistence boundary now uses the same strict normalizer, while replay and state projections use the same comparison helpers. No database migration or local-data reset is required for this change. Existing canonical records remain valid; legacy renderer-only shard/session/action observations are reparsed from their source logs into the corrected canonical form.

This change does not alter event IDs for already-valid canonical events, the `runtime-event/v1` schema, retention, or synchronization policy. If historical data containing offset-less timestamps is introduced later, it must be quarantined or migrated under a source-specific, documented time-basis decision rather than silently guessed.

## Call-site inventory

| Boundary | Policy |
| --- | --- |
| Legacy and canonical log parsers | `parseGameLogTimestamp`; require an explicit source offset |
| Event validation and persistence | `parseAbsoluteInstant` / `normalizeAbsoluteInstant`; require canonical or absolute input as appropriate |
| Runtime orchestration, lifecycle/state projections, unknown evidence | Shared conversion, comparison, elapsed, min, and max helpers |
| Renderer stream, freshness, age, detail | Strict renderer parser plus local `Intl` presentation |
| Application/tailer/source-discovery clocks | `new Date().toISOString()` is intentional generation of ingestion or observation time |
| Retention cutoff | `Date` arithmetic is intentional system-clock arithmetic; the resulting boundary is canonical UTC |

Direct `Date.parse` and `new Date(string)` use outside the two time modules is prohibited for telemetry interpretation. Direct `new Date()` remains appropriate at explicit system-clock boundaries.

## Verification expectations

Automated coverage must include UTC, positive and negative offsets, fractional precision, missing/malformed/impossible/offset-less inputs, DST transitions, multiple host time zones, mixed event-family ordering, persistence/replay, and deterministic ties. Performance verification must confirm that central parsing and cached display formatters do not materially regress the live parser or bounded stream rendering.

## Technology and libraries

None. The contract uses built-in JavaScript `Date` only behind validated parsing and built-in `Intl.DateTimeFormat` only at the renderer display boundary.
