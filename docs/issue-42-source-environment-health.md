# Issue 42: source, environment, lifecycle, and monitor health

The Runtime Monitor keeps source context and monitor health in a persistent header strip and status bar. The renderer consumes the main-process snapshot and lifecycle projection; it does not infer health from a quiet log.

## Content contract

- Environment is the uppercase release-channel enum (`LIVE`, `PTU`, `EPTU`, `HOTFIX`, or `UNKNOWN`). Build identifiers remain opaque strings.
- Lifecycle is a canonical label such as `In game`, `Loading`, `Frontend`, `Disconnected`, `Exited`, or `Unknown`. The last transition is shown as a compact relative age and retains its exact timestamp in the accessible detail/title.
- Source is a privacy-safe channel/install label and generic display path. The full path is never included in the default surface. Explicit source details expose only the approved display path and provide validated source selection, retry/re-scan, and containing-folder actions.
- Health labels are `Unknown`, `Healthy`, `Recovering`, `Paused`, `Degraded`, `Source missing`, `Stopped`, or `Error`; text and state attributes remain present without relying on color.
- Freshness is relative (`Now`, seconds, minutes, or hours); exact timestamps are available as detail metadata. Quiet activity does not make a healthy monitor stale.
- Backlog displays unread bytes. Event count is explicitly unavailable until line framing supplies that measurement; the UI does not fabricate a count.

## State and interaction behavior

The main process remains authoritative for source validation, tailer status, source identity, and safe folder opening. Source actions report failures through the existing transient action alert and successful lifecycle changes through a polite, bounded status announcement. Source details can be opened from the header without changing the stream or current-state selection.

The surface distinguishes discovering/loading, awaiting source, live, paused, recovering, disconnected/source missing, unsupported profile, degraded, stopped, and fatal/error states. Source detail and retry actions are keyboard reachable; source paths remain absent from default content and renderer IPC accepts only source IDs.

## Verification

Happy path: discover a validated source, start monitoring, append input, confirm environment/lifecycle/freshness/backlog values, switch Terminal/Table, open source details, retry, select another candidate, and open its containing folder.

Unhappy path: exercise missing, moved, inaccessible, unsupported, rotated, paused, backlogged, and fatal states. Confirm distinct labels, no path disclosure in the default surface, no fabricated lifecycle transition, polite transition announcements, and recoverable action errors.
