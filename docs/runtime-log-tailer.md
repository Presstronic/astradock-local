# Runtime Log Tailer

## Status and Purpose

| Field | Value |
| --- | --- |
| Status | Initial MVP implementation |
| Delivery issue | [#20](https://github.com/Presstronic/astradock-local/issues/20) |
| Runtime module | [`src/runtimeLogTailer.js`](../src/runtimeLogTailer.js) |
| Main-process integration | [`src/main.js`](../src/main.js) |
| Tests | [`test/runtimeLogTailer.test.js`](../test/runtimeLogTailer.test.js) |

The runtime log tailer is the byte-oriented source reader for approved Star Citizen `game.log` files. It replaces the prototype watch-triggered whole-file rescan path for live monitoring. The tailer owns file identity, offsets, generations, lifecycle records, checkpoints, health, and slow-consumer backpressure. It does not parse lines or gameplay semantics.

## Technology and Libraries

None.

The implementation uses Node.js built-ins only:

- `fs.watch` as a best-effort hint for file and parent-directory changes.
- `fs/promises.stat`, `open`, `read`, and `close` for identity verification and append-only reads.
- `EventEmitter` for in-process observability in tests and future adapters.
- `setInterval` as a low-frequency recovery poll because filesystem notifications are not reliable enough to be the source of truth.

No watcher package or native dependency is introduced. If a watcher library is proposed later, the implementation issue must record exact package version, platform behavior, maintenance status, license, native dependency and packaging impact, and security review.

## Contract

`RuntimeLogTailer` consumes one validated absolute source path from the privileged process. Renderer code cannot provide paths directly to the tailer; it can only select a previously validated source ID through the hardened monitor API.

Startup modes:

| Mode | Behavior |
| --- | --- |
| `from_current_end` | Begin at the file size observed when monitoring starts. Existing bytes are not replayed. |
| `from_beginning` | Begin at offset `0` for explicit local replay. |
| `from_checkpoint` | Resume from a checkpoint only when the checkpoint source identity matches the current file identity. The offset is clamped to the current file size. If identity differs, the tailer starts at the current end on initial startup. |

For append reads, each delivered chunk includes:

- Monotonic sequence number.
- Source generation.
- Source identity.
- `offsetStart`, `offsetEnd`, and `byteLength`.
- Source observation timestamp and ingestion timestamp.
- File size observed before the read.
- Raw bytes for the in-process downstream consumer only.

The renderer subscription receives only metadata for `monitor.bytes`; raw bytes are not exposed through IPC.

Lifecycle records include:

- Tailer started and stopped.
- Source available and unavailable.
- Source replacement.
- Source truncation.
- Backpressure paused and resumed.
- Consumer and read errors.

Lifecycle and health DTOs intentionally omit full paths and raw log data. Errors report bounded status codes such as `missing`, `permission_denied`, `locked`, `not_file`, and `read_error`.

## File Lifecycle Behavior

Filesystem notifications are treated as hints. Before reading, the tailer stats the path and compares source identity, size, and tracked offset.

- Normal append: read only `[offset, size)` and advance the checkpoint after successful downstream delivery.
- Duplicate notifications: coalesce checks while one read is in flight and do not reread already delivered offsets.
- Partial writes: deliver the exact bytes observed. Line framing is a downstream responsibility and must carry incomplete trailing bytes.
- Long writes: split reads into bounded chunks. The default chunk size is 64 KB, matching the maximum supported complete-line target in ADR-0004.
- Truncation: create a new generation, reset offset to `0`, emit `source.truncated`, and read new bytes from the truncated file.
- Replacement or rotation at the same path: create a new generation, reset offset to `0`, emit `source.replaced`, and read the new file without using the old offset.
- Deletion or creation delay: emit `source.unavailable`, keep watching the parent directory and recovery poll, and emit `source.available` when the file returns.
- Clean shutdown: close file and parent watchers, stop polling, and give an in-flight delivery a bounded chance to settle.

## Backpressure

The tailer does not buffer unbounded data in memory. It awaits downstream chunk delivery before advancing the checkpoint. If the downstream consumer is slow, the tailer emits `backpressure.paused`, leaves unread data in the file, and resumes from the previous offset when the consumer catches up. If the consumer throws, the tailer pauses with `consumer_error` and keeps the offset at the failed chunk start so retry does not silently lose bytes.

This issue provides the tailer boundary for later framing, extraction, persistence, and renderer projection work. Durable event correctness remains the responsibility of the future local store and canonical event pipeline.

## Main-Process Integration

`monitor.start` starts `RuntimeLogTailer` before running the explicit scan that preserves the current proof-of-concept snapshot behavior. This avoids skipping bytes appended during startup. After monitoring starts, live file changes are handled by the tailer and published as `monitor.bytes` and `monitor.lifecycle` subscription changes. The removed prototype behavior is the previous `fs.watch` callback that reparsed the entire file and sent `monitor.scan` after every notification.

`monitor.scan` remains an explicit user/API command for current whole-file parser inspection. It is not the live monitoring execution path.

## Verification Guidance

Run:

```bash
npm test
npm run benchmark:tailer
npm run build
```

Focused coverage includes:

- Append-only byte delivery and duplicate notification coalescing.
- `from_current_end`, `from_beginning`, and `from_checkpoint` startup behavior.
- Truncation, replacement, deletion, and reappearance.
- Slow-consumer backpressure without data loss.
- Default error/lifecycle records without full-path disclosure.

The benchmark command runs a dependency-free synthetic append workload against the tailer and fails if delivered bytes do not exactly match written bytes, backlog remains, the tailer leaves monitoring state, or p95 delivery exceeds 500 ms for the measured batches. It currently covers:

- Sustained workload: 100 lines/s for 2 seconds.
- Burst workload: 1,000 lines/s for 1 second.
- 192-byte representative synthetic lines.
- 64 KB default tailer chunks.

Local benchmark evidence captured on 2026-08-12 using Node `v22.14.0` on Linux x64:

| Workload | Lines | Bytes | p50 delivery | p95 delivery | Max delivery |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sustained 100 lines/s | 200 | 38,400 | 1.88 ms | 5.73 ms | 6.25 ms |
| Burst 1,000 lines/s | 1,000 | 192,000 | 1.77 ms | 3.85 ms | 3.85 ms |

The same run delivered `230,400` of `230,400` expected bytes, reported zero backlog, and used approximately 50 MB RSS / 5 MB heap in the benchmark process. This is implementation evidence for the byte tailer only. Packaged-app CPU, renderer latency, durable persistence, and 4-hour soak evidence remain release qualification work once the downstream runtime pipeline exists.

Manual verification should cover:

1. Start monitoring an approved source, append lines to `game.log`, and verify the status changes to live byte observation without a full rescan.
2. Stop monitoring and confirm no further byte or lifecycle updates are delivered.
3. Delete, recreate, truncate, and replace the selected log while monitoring and confirm the UI reports source lifecycle changes.
4. Reload the renderer while monitoring and verify `monitor.getSnapshot()` reports main-owned tailer health.

## Known Limitations

- The tailer is in the current CommonJS main-process shell. ADR-0001 still targets a future TypeScript runtime boundary and utility-process architecture.
- Incremental line framing, gameplay profile extraction, canonical event persistence, durable checkpoint storage, and performance instrumentation are follow-up pipeline work.
- Cross-platform `fs.watch` behavior still needs packaged Windows and Linux/Wine/Proton validation. The implementation uses stat verification plus polling so correctness does not depend on notification ordering.
