# Issue 38: TUI-inspired Terminal event presentation

## Implemented contract

Terminal is a presentation of the shared normalized event stream. It renders the same bounded, ordered event window and selection identity as Table, so switching views does not create a second subscription or alter the selected event. The shared stream window is capped at 200 rendered events; browsing and unseen counts remain owned by the shared stream model.

Each line contains a local 24-hour clock value, human-readable event kind, explicit urgency cue, concise normalized summary, relevant context, and confidence qualification. Full timestamps, event IDs, source lines, and permitted raw evidence remain in the shared detail drawer. Missing timestamps and fields use explicit unknown/fallback labels.

## Keyboard and accessibility behavior

The Terminal listbox is keyboard-operable with Arrow Up/Down, Home, End, Enter, and Space. Selection is announced through the active descendant and option name. Urgency and event kind have text labels in addition to semantic styling. Long or control-character-containing values are normalized and capped by the formatter; React text rendering keeps content inert and does not interpret markup.

The stream distinguishes no collected telemetry from a populated stream with no matching query results. Mode, result count, unseen count, and recovery/browse controls remain in the shared stream status region. Detail selection continues to open the right-default shared drawer and can be closed with the existing focus-return behavior.

## Verification

Happy path: load representative events, navigate the Terminal with the keyboard, activate a row, inspect its detail, switch to Table, and confirm the event identity and selection remain shared.

Unhappy path: use missing timestamps, missing fields, long/control-character-containing summaries, unknown event kinds, a burst larger than the render window, empty telemetry, and a query with no matches. Confirm bounded rendering, explicit fallback text, inert content, accessible urgency labels, and distinct empty states.

## Technology and libraries

None. The implementation uses the existing TypeScript/React renderer, built-in browser keyboard semantics, and the existing shared event stream model.
