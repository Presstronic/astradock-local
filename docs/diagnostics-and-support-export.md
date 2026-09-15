# Local diagnostics and support export

AstraDock Local keeps diagnostics on the device. The rotating application log is structured, bounded, permission-restricted, and sanitized before it is written. It contains operational errors and correlation-safe event names, not raw `Game.log` lines, credentials, account identifiers, exact paths, or network addresses.

The Settings workspace provides a preview and an explicit “Choose destination & export” action. The main process opens the destination dialog and writes an atomic JSON bundle with mode `0600`. The bundle contains application metadata, a bounded health snapshot, recent sanitized application diagnostics, a short scope explanation, redaction counts, and a SHA-256 manifest for each content file. There is no upload path.

The default bundle excludes raw game logs. Preview reports file categories, estimated size, redaction count, and the fixed local-only scope. Cancellation at the destination dialog produces no file. Write failures remove the temporary file and return a safe actionable error. Application diagnostic files can be deleted independently; Reset app data also deletes them. Telemetry deletion remains a separate control.

The export is intentionally a JSON bundle rather than a compressed archive so users and maintainers can inspect it without a third-party extractor. Resource use is bounded by the support service’s log byte and record limits.
