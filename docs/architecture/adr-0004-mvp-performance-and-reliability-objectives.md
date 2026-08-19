# ADR-0004: MVP performance and reliability objectives

- **Status:** Accepted
- **Date:** 2026-08-11
- **Decision owners:** AstraDock Local product owner and maintainers
- **Decision issue:** [#6](https://github.com/Presstronic/astradock-local/issues/6)
- **Applies to:** v0.1.0 Runtime Monitor performance, reliability, and release qualification unless superseded

## Context

AstraDock Local's MVP Runtime Monitor must feel near real time while Star Citizen is running, but "near real time", "bounded", "recoverable", and "reliable" need measurable gates. Without objective targets, tailing, parsing, persistence, projections, renderer delivery, stale-state detection, and release soak tests cannot prove that the application is adequate or avoid regressing.

The targets in this ADR are provisional MVP gates. They are intentionally concrete enough to guide implementation and release review, while remaining open to revision when representative sanitized logs, real hardware measurements, and packaged-build evidence justify a change. A target may be superseded by a later ADR or release-readiness decision, but implementation issues must not leave the requirement qualitative.

## Decision summary

AstraDock Local v0.1.0 will use the following provisional quality objectives:

| Area | MVP target |
| --- | --- |
| Representative baseline | Modest supported gaming PC: Windows 10/11 x64, 4-core CPU, 16 GB RAM, SATA SSD |
| Observed complete line to durable event | p95 <= 500 ms; p99 <= 1.5 s |
| Observed complete line to visible UI update | p95 <= 1 s; p99 <= 2.5 s |
| Startup to monitoring ready, known source | p95 <= 3 s |
| Startup to monitoring ready, source discovery needed | p95 <= 10 s |
| Application restart replay recovery | p95 <= 5 s for retained MVP-scale history |
| Sustained monitoring CPU | <= 2% average app CPU on baseline hardware |
| Burst CPU | <= 10% app CPU for short bursts, then returns to sustained target |
| Memory | <= 250 MB total app working set during a 4-hour representative session |
| Database size | Follow [`ADR-0003`](adr-0003-mvp-local-persistence-engine-and-retention-model.md): 250 MB soft cap |
| Sustained log input workload | 100 lines/s |
| Burst log input workload | 1,000 lines/s for 10 s |
| Maximum supported complete line length | 64 KB without crash, unbounded memory growth, or parser deadlock |
| Burst backlog recovery | Drain burst backlog within 30 s after input returns to sustained rate |
| Stale or disconnected monitoring detection | Visible stale/disconnected state within 15 s |
| Graceful shutdown flush and checkpoint | <= 2 s target; 5 s hard timeout |
| Soak test | 4 hours representative monitoring without leaks or unbounded growth |

Recognized complete events must not be silently lost. Duplicate internal processing is acceptable only when stable event IDs or idempotency rules collapse duplicates before user-visible history, retained projections, or future sync eligibility. Source order must be preserved within one log file. Cross-source ordering must use timestamps plus ingestion sequence and must not pretend stronger ordering than the evidence supports.

Canonical event history and timeline UI should only present recognized events after the event is durably accepted by the local event store. Live transient status may update optimistically from validated observations only when the UI representation is clearly not presented as durable history. If durable persistence fails, the Runtime Monitor must expose degraded health and must not claim the event is retained.

## Measurement points

Instrumentation and tests must distinguish these points:

| Point | Meaning |
| --- | --- |
| `source_observed_at` | Time the tailer observes a complete line or semantic record boundary from an approved source. |
| `framed_at` | Time line framing and partial-line handling finish. |
| `candidate_extracted_at` | Time profile dispatch and field extraction produce an untrusted candidate. |
| `event_validated_at` | Time runtime validation produces a canonical event or rejects/quarantines the candidate. |
| `event_committed_at` | Time the event and required checkpoint/projection transaction are durably accepted. |
| `projection_updated_at` | Time affected current-state projections are updated or invalidated. |
| `runtime_published_at` | Time the runtime emits a bounded renderer-safe change, invalidation, or snapshot update. |
| `main_routed_at` | Time the Electron main process validates and routes the update. |
| `renderer_received_at` | Time the renderer application client receives the update. |
| `ui_visible_at` | Time the update is committed to the visible UI in a measured renderer pass. |

Latency targets are measured from `source_observed_at` unless a test explicitly declares a different start point. Collection, extraction, durable commit, projection, IPC, and rendering latency must be reportable separately so a failure identifies the responsible boundary.

## Workload Definitions

### Steady-state workload

The steady-state workload simulates representative active play:

- 100 appended log lines per second.
- A mix of recognized lines, ignored known-noise lines, unknown candidate lines, partial lines, and multi-line semantic records.
- At least 10 supported event families once those families exist.
- Renderer visible and subscribed to the live Runtime Monitor.
- Database already initialized and under the 250 MB soft cap.
- Retained history at MVP scale, initially modeled as 30 days of representative telemetry.

### Burst workload

The burst workload simulates short intense log activity:

- 1,000 appended log lines per second for 10 seconds.
- At least 10% recognized or candidate records.
- At least 10% unknown evidence candidates.
- Multiple partial-line boundaries and duplicate file-watch notifications.
- Renderer visible for one run and hidden or paused for another run.
- Backlog must drain within 30 seconds after input returns to the steady-state rate.

### Recovery workload

The recovery workload exercises:

- App startup with a known source.
- App startup requiring source discovery.
- Renderer reload or renderer crash while monitoring continues.
- Runtime process restart.
- Application restart with retained telemetry replay.
- Log truncation.
- Log rotation or replacement.
- Partial trailing line followed by completion.
- Slow persistence operation.
- Disk-full, permission-denied, locked-file, failed-compaction, and corrupt-store conditions as defined by [`ADR-0003`](adr-0003-mvp-local-persistence-engine-and-retention-model.md).

### Soak workload

The soak workload runs for 4 hours on the representative baseline or an approved equivalent:

- Sustained representative append activity with periodic bursts.
- Renderer visible for part of the run and hidden/minimized for part of the run.
- At least one source restart or log replacement event.
- Retention cleanup and storage metric collection if thresholds are reached or can be safely simulated.
- No unbounded queue growth, memory growth, database growth beyond policy, duplicate user-visible events, or stale healthy-state reporting.

## Resource Budgets

### CPU

Sustained monitoring should average no more than 2% app CPU on baseline hardware. Short bursts may reach 10% app CPU while input is elevated, but the app must return to the sustained budget after the backlog drains.

CPU attribution must separate runtime pipeline work, Electron main work, renderer work, and persistence work where tooling permits. The app must not use busy waiting for file monitoring, queue draining, retries, or stale-state detection.

### Memory

The total app working set should remain at or below 250 MB during a 4-hour representative session. Measurement should record per-process memory where available: main process, runtime utility process, renderer, and helper processes.

Queues, buffers, subscriptions, and renderer-visible lists must be bounded. Long histories use paging, snapshots, virtualization, or invalidation rather than unbounded in-memory arrays.

### Disk

Database growth follows [`ADR-0003`](adr-0003-mvp-local-persistence-engine-and-retention-model.md): 30-day telemetry retention with a 250 MB soft cap. Disk measurements must record database size, WAL or equivalent sidecar size, retained row counts by data class, cleanup duration, and compaction outcome where applicable.

Write amplification should be measured during implementation after the encrypted SQLite driver is selected. The MVP gate is qualitative until the driver exists: the app must not rewrite the whole store or retained history during normal append processing.

### Renderer and GPU

Renderer work must not require unbounded DOM growth. Live terminal/table views must use bounded rendering, paging, virtualization, truncation, or aggregation appropriate to the final design. The UI should remain responsive to scrolling, filtering, event drilldown, and monitoring controls during the steady-state workload.

GPU budgets are qualified through renderer responsiveness and visual correctness for MVP rather than a numeric GPU-utilization target. A numeric GPU target is deferred until the production UI and measurement tooling exist.

## Reliability Objectives

### Data loss, duplication, and ordering

- Recognized complete events must not be silently dropped.
- If the app cannot commit required durable state, it must report degraded health and preserve enough information to recover or diagnose.
- Duplicate notifications, repeated reads, restart replay, or retried transactions must not create duplicate user-visible history.
- Source order is authoritative within one log file.
- Cross-source and cross-environment ordering uses event timestamp, ingestion timestamp, environment identity, and ingestion sequence; it must not merge environments or imply a global game ordering not present in evidence.
- Unknown input may be bounded or sampled under documented retention policy, but recognized supported events must not be sacrificed to hide overload.

### Backpressure

The runtime must apply bounded backpressure at filesystem read, framing, extraction, persistence, projection, and renderer-delivery boundaries. If overload exceeds MVP targets, the app must preserve durable correctness, surface degraded health, and prefer dropping or coalescing renderer notifications over losing recognized canonical events.

### Stale and disconnected state

The UI must show a stale or disconnected monitoring state within 15 seconds when the active source stops producing expected health signals, file access fails, the runtime process is unavailable, or the main process can no longer receive runtime health.

This objective starts when a monitor/source fault becomes observable; it is not a heartbeat requirement for `game.log`. Normal log silence is neutral activity age and must not age a directly observed shard, PU session, replication connection, party, zone, or destination fact into a warning. Source/tailer health, parser compatibility, observation age, and latched domain state use independent clocks and labels.

Stale-state detection must distinguish:

- No new gameplay lines but source is still readable.
- Source file missing, moved, replaced, locked, or permission denied.
- Runtime unavailable or restarting.
- Renderer disconnected from main/runtime state.
- Persistence degraded.

### Shutdown and crash recovery

Graceful shutdown targets a durable flush and checkpoint within 2 seconds. The hard timeout is 5 seconds; if exceeded, shutdown may terminate runtime work only after recording safe diagnostic state where possible.

After crash or forced termination, the app must recover to the last committed event and checkpoint, replay idempotently, and make any uncertainty visible. Recovery must not silently skip recognized events that were committed before the crash, and must not duplicate events that are replayed from an already observed source region.

## Regression and Release Gates

Once instrumentation exists for a target, that target is release-blocking for v0.1.0 unless a reviewed exception records:

- The measured result.
- The affected hardware, platform, workload, and build.
- User impact.
- Risk and mitigation.
- Whether the exception blocks wider distribution beyond the limited alpha.
- A follow-up issue.

Before instrumentation exists, implementation issues must include enough design and tests to make later measurement possible. A target is not satisfied by claiming that it cannot yet be measured.

Release candidates must record:

- Application version and commit.
- Platform, OS version, and package type.
- Hardware or virtualization context.
- Electron, Chromium, and Node versions.
- Storage driver and encryption mode once selected.
- Workload fixture or generator version.
- Latency percentiles, resource metrics, queue/backlog metrics, and failure/recovery outcomes.
- Deviations and follow-up issues.

## Tooling and Methodology

This ADR introduces no dependency by itself.

Implementation should evaluate and adopt lightweight measurement tools for:

- Synthetic log append generation from sanitized fixtures.
- Pipeline timestamp capture with monotonic clocks.
- Percentile and histogram reporting.
- Per-process CPU and memory sampling.
- Database size, WAL/sidecar size, row counts, cleanup timing, and compaction outcome.
- Renderer update timing through Playwright or an equivalent desktop workflow harness.
- Long-running soak orchestration and result artifacts.

CI should cover deterministic synthetic workloads, replay, ordering, deduplication, retention, and failure simulations that do not require real Star Citizen. Manual release qualification covers packaged-app resource budgets, platform-specific file behavior, renderer responsiveness, update lifecycle, and multi-hour soak runs on the representative baseline or approved equivalents.

## Deferred Targets

The following targets are intentionally deferred:

- Numeric GPU utilization.
- Numeric write-amplification threshold before encrypted SQLite driver selection.
- Final fixture-derived retained-event volume for 30 days of real play.
- Per-distribution Linux resource budgets beyond the shared x86_64 target.
- Mining-job resource and cancellation targets, because installed game-data mining is post-MVP.
- Station batching, retry, and time-to-drain targets, because Station synchronization is post-MVP.

These deferrals do not block the local-only Runtime Monitor MVP as long as the architecture leaves measurement points and bounded-resource behavior in place.

## Consequences

### Positive

- Implementation and release review have numeric gates instead of subjective performance claims.
- Pipeline latency is separated from renderer presentation latency.
- Correctness and durability are prioritized over hiding overload.
- The targets are strict enough to expose design flaws early but can be revised with evidence.

### Costs and risks

- Instrumentation and workload generation become required implementation work.
- Some targets may need adjustment once encrypted persistence and production UI costs are measured.
- Running soak and packaged-app validation adds release effort even for a limited alpha.
- Baseline hardware is representative, not a guarantee that every supported user machine will see identical performance.

## Follow-up requirements

- Tailer, parser, store, projection, renderer, and release-readiness issues must copy the relevant numeric gates from this ADR.
- The instrumentation implementation must record the measurement points defined here.
- Sanitized fixtures and synthetic workload generators must be versioned so benchmark results are reproducible.
- Release records must include the workload, hardware, platform, and result evidence needed to interpret pass/fail status.
- Any superseding quality-target ADR must identify which measured evidence changed the target.

## Supersession

Changes to MVP latency percentiles, workload rates, resource ceilings, stale detection, data-loss tolerance, shutdown/recovery targets, soak duration, or release-blocking semantics require an update to this ADR or a superseding decision. Routine benchmark-tool implementation details may change without superseding the objectives if the measured meaning remains equivalent.
