# ADR-0002: MVP platform support, packaging, and update policy

- **Status:** Accepted
- **Date:** 2026-08-10
- **Decision owners:** AstraDock Local product owner and maintainers
- **Decision issue:** [#4](https://github.com/Presstronic/astradock-local/issues/4)
- **Related delivery issue:** [#50](https://github.com/Presstronic/astradock-local/issues/50)
- **Applies to:** v0.1.0 limited alpha and subsequent MVP releases unless superseded

## Context

AstraDock Local is a Windows-first Electron desktop companion with a supported Linux path for Star Citizen installations managed through Wine, Proton, or LUG tooling. The proof-of-concept package configuration currently emits Windows NSIS and portable artifacts plus Linux AppImage and Debian artifacts. Those targets demonstrate build feasibility; they are not an approved support contract.

MVP needs an explicit policy for supported operating systems and architectures, artifact types, privilege requirements, install and application-data locations, automatic updates, signing, upgrade and downgrade behavior, uninstall and data retention, and release evidence. Without it, a successful build could be mistaken for a supported release, and implementation could make incompatible assumptions about paths, permissions, storage, or update lifecycle.

The initial distribution audience is a very limited alpha. Limited distribution reduces rollout exposure but does not relax privacy, data-integrity, update-safety, or support-claim requirements.

## Decision summary

AstraDock Local v0.1.0 will:

- Treat Windows as the primary platform.
- Support 64-bit Windows 10 version 22H2 and supported 64-bit Windows 11 releases.
- Revisit Windows 10 support if it materially restricts security updates, Electron/Chromium upgrades, application capability, packaging, or maintainability.
- Support current 64-bit Linux distributions used or recommended by the Star Citizen Linux Users Group, through the explicit matrix in this ADR.
- Ship one per-user Windows NSIS installer; it will not ship a Windows portable artifact.
- Permit maintainers to create a clearly labeled, manually transferred Windows x64 standalone artifact solely for cross-machine testing; it is not a release artifact, update target, or supported distribution format.
- Ship one Linux AppImage for the limited alpha; it will not initially ship `.deb`, RPM, AUR, Flatpak, Snap, or distribution-native packages.
- Use GitHub Releases as the v0.1.0 release and automatic-update origin unless a later security or operational review supersedes it.
- Check for and download eligible updates automatically, then install them silently on the next normal application restart.
- Never force-close or force-restart AstraDock to apply an update during active monitoring.
- Permit narrowly distributed unsigned prerelease alpha artifacts temporarily, with explicit warnings, while requiring signed and timestamped Windows artifacts before v0.1.0 is complete.
- Preserve application data across normal upgrades.
- Treat downgrades as best-effort compatibility, never as permission to corrupt, silently discard, or misinterpret newer data.
- Prompt Windows users during uninstall to preserve or delete local application data; preservation is the safe default.

## Support terminology

For this limited alpha:

- **Primary supported** means the platform receives the full release-regression matrix, is a release gate, and is the first target for support and compatibility fixes.
- **Supported** means AstraDock publishes an intended artifact, documents installation, executes the applicable smoke and compatibility matrix, and treats reproducible AstraDock defects as product defects. It does not promise that Cloud Imperium Games, Wine, Proton, GPU drivers, or third-party LUG tooling supports the environment.
- **Unsupported** means no compatibility claim or release gate. The application may run, but maintainers do not promise validation or fixes.

Support applies to AstraDock Local's own installation discovery, file access, telemetry monitoring, persistence, UI, and update behavior. It does not assert that Star Citizen itself is officially supported by its publisher on Linux.

## Windows support matrix

| Environment | Architecture | Tier | Required release evidence |
| --- | --- | --- | --- |
| Windows 11, current supported release | x64 | Primary supported | Full clean-install, update, monitoring, recovery, uninstall, accessibility, and packaging regression |
| Windows 10 22H2 | x64 | Primary supported for v0.1.0 | Same full regression on the owner's physical Windows 10 machine or an approved equivalent |
| Windows on ARM | arm64 | Unsupported for v0.1.0 | None; x64 emulation success does not create a support claim |
| Windows 32-bit | ia32 | Unsupported | No artifact |
| Windows Server, Windows 10 before 22H2, and Windows 7/8/8.1 | Any | Unsupported | No artifact |

Windows 10 reached the end of normal Microsoft support before this decision. Supporting 22H2 is therefore conditional. Each planned Electron or Chromium upgrade must confirm continued upstream compatibility and security viability. If Windows 10 blocks a supported runtime, security control, packaging behavior, or material product capability, maintainers must open a superseding decision rather than pinning an obsolete dependency or weakening the product. Users must receive advance notice where practical.

## Linux support matrix

The Star Citizen LUG knowledge base currently recommends Fedora, Arch, EndeavourOS, openSUSE Tumbleweed, Bazzite, the latest Ubuntu release, Debian Testing, and Gentoo. LUG Helper also documents NixOS packaging and AppImage use for immutable distributions such as SteamOS. These are external, evolving references; AstraDock records the validated distribution version or snapshot for every release rather than promising compatibility with an unbounded future `latest`.

All Linux support is x86_64 only for v0.1.0.

| Distribution/environment | v0.1.0 tier | Validation expectation |
| --- | --- | --- |
| Fedora, current supported release | Supported | Direct release smoke and monitoring-path validation |
| Arch, current rolling snapshot | Supported | Direct release smoke and monitoring-path validation |
| EndeavourOS, current rolling snapshot | Supported | Install/discovery smoke; shared Arch-family regression may satisfy common behavior |
| openSUSE Tumbleweed, recorded snapshot | Supported | Install/discovery smoke and filesystem integration |
| Bazzite, current stable image | Supported | Direct immutable/Flatpak-oriented environment validation using AppImage |
| Ubuntu, latest non-LTS release identified in release notes | Supported | Direct release smoke and monitoring-path validation |
| Debian Testing, recorded snapshot | Supported | Install/discovery smoke and filesystem integration |
| Gentoo, current maintained profile | Supported | Install/discovery smoke; record profile and relevant runtime versions |
| NixOS, current stable release | Supported | Direct non-FHS path and AppImage compatibility smoke |
| SteamOS, current stable release | Supported | Direct immutable environment and AppImage compatibility smoke where suitable x86_64 hardware or an approved equivalent is available |

Ubuntu LTS, Debian Stable, Linux Mint, Pop!_OS, Zorin, openSUSE Leap, Manjaro, Drauger OS, and other distributions are not advertised as supported in v0.1.0 merely because AppImage may run on them. A distribution can be added through a reviewed matrix update with reproducible evidence.

The release record must state the exact versions or rolling snapshots tested. Where a derivative uses the same runtime and packaging path as its base, a shared automated suite is acceptable, but every advertised distribution still requires at least an installation, launch, discovery, monitoring, persistence, and update smoke test before release. Missing test access blocks that distribution's support claim, not the entire Windows release.

## Artifact policy

### Windows

The only supported Windows artifact is a 64-bit NSIS installer.

- Installation is per-user by default and does not require administrator privileges.
- Installation and update must use user-writable locations and must not depend on machine-wide registry or filesystem access.
- The installer may create approved Start menu and desktop integration without introducing file associations or background services that are not product requirements.
- The installer and installed application must use a stable application identifier, publisher identity, install location, and application-data location across upgrades.
- No Windows portable, MSI, MSIX/AppX, web installer, or per-machine artifact ships in v0.1.0.

Maintainers may deliberately invoke the separate Windows x64 standalone test build documented in [`../windows-standalone-testing.md`](../windows-standalone-testing.md). It uses Electron Builder's `portable` target as a packaging mechanism, but it does not change the release contract above:

- Normal distribution and release automation must not build, publish, attach, advertise, or generate update metadata for it.
- Its filename includes `standalone-test`, and its output is isolated from normal distribution artifacts.
- It is transferred manually only to known test machines and supplements, but never replaces, installer qualification.
- It provides no installer, uninstaller, shortcut, registry, or automatic-update behavior and creates no support claim.
- It uses AstraDock's normal per-user application-data location. Application data does not travel beside the executable and remains after the executable is deleted.
- It may be unsigned during prerelease testing under the existing narrow unsigned-alpha allowance. That allowance does not relax release signing requirements or justify bypassing operating-system security controls.

Per-user installation does not remove any currently planned MVP capability. AstraDock monitors only while the application is running, needs no service, driver, privileged file association, machine-wide integration, or all-users install. Native dialogs may grant access to non-default game locations without elevating the application.

### Linux

The only supported Linux artifact for the limited alpha is a 64-bit AppImage.

AppImage is selected because the LUG-aligned support matrix spans mutually incompatible package managers and immutable environments. A `.deb` would improve native Ubuntu/Debian integration but would not serve Fedora, Arch, openSUSE, Gentoo, NixOS, Bazzite, or SteamOS. Shipping both immediately would double artifact, update, install, and release-validation paths without adding application capability.

The AppImage policy requires:

- No root privileges for normal execution or updates.
- No assumption that the AppImage resides at a fixed path.
- Stable XDG-compliant configuration, data, state, cache, and log locations outside the AppImage.
- Explicit desktop-integration instructions where the environment does not provide them.
- Clear removal instructions: deleting the AppImage removes the program artifact but not retained application data.
- An in-application local-data deletion/reset capability before general availability; until implemented, documented XDG removal steps must be exact and safe.

Distribution-native packages may be reconsidered after alpha demand and maintenance capacity are measured. Their absence is not a degraded support tier for the listed v0.1.0 distributions.

## Application-data locations and permissions

- Windows application data belongs under the appropriate per-user application-data directory resolved through Electron, never beside the executable or in the game installation.
- Linux configuration, data, state, cache, and logs follow XDG base-directory conventions with documented fallbacks.
- Game-source paths may reside on non-default Windows drives, secondary Linux filesystems, Wine prefixes, Proton prefixes, or user-selected locations.
- AstraDock requests only the access required to discover or read an approved `game.log`; it must not change game files or request elevation to bypass filesystem permissions.
- Full private paths are sensitive and are not shown in default UI, telemetry, diagnostics, or release evidence.
- Application-data files use the narrowest practical user-only permissions. Later persistence decisions define the exact database and data-class layout.

## Automatic-update policy

GitHub Releases is the expected v0.1.0 update origin. Release automation must publish the required installer/AppImage artifacts, update metadata, integrity metadata, and channel designation atomically enough that clients never receive metadata for an unavailable artifact.

The application will:

1. Check the applicable approved channel automatically after launch and periodically at a bounded cadence while running.
2. Download an eligible update silently in the background with bounded bandwidth, disk usage, retry, and backoff behavior.
3. Verify artifact integrity, expected application identity, version/channel compatibility, and every available platform signature before marking it ready.
4. Continue normal local monitoring if checking or downloading fails.
5. Apply a verified update silently on the next normal application restart.
6. Never force-close the application, interrupt active monitoring, or force a restart to apply an update.
7. Expose concise current, checking, downloading, ready-on-restart, failed, and unsupported-update states without turning update traffic into gameplay telemetry.

The limited alpha uses a prerelease channel and must not automatically cross into or out of another channel without an explicit policy. GitHub credentials or personal access tokens must never be embedded in the application; release assets intended for automatic client retrieval must be available through a client-safe publication mechanism.

## Signing and trust

Unsigned Windows prerelease builds may be supplied directly to the very limited alpha audience before signing infrastructure is ready. They must be clearly identified as unsigned and may trigger Windows trust warnings. They are not acceptable evidence for completion of v0.1.0.

[Issue #50](https://github.com/Presstronic/astradock-local/issues/50) requires acquisition and integration of protected Windows Authenticode signing, trusted timestamping, publisher verification, negative update tests, key rotation, revocation, recovery, and incident procedures during the v0.1.0 milestone.

Before v0.1.0 is declared complete:

- Every published Windows installer and update artifact is signed and timestamped with the approved publisher identity.
- Release automation verifies the produced signature before publication.
- The update client rejects unsigned, modified, invalidly signed, or unexpected-publisher Windows artifacts.
- Production signing authority is unavailable to pull-request and other untrusted workflows.

Linux signing and repository metadata are deferred because v0.1.0 ships an AppImage rather than a native repository package. AppImage integrity and update authenticity still require an approved verification design before public distribution; HTTPS transport alone is not sufficient proof of publisher identity.

## Install, upgrade, downgrade, and uninstall behavior

### Clean installation

- Windows installs per user without elevation into the stable approved location.
- Linux runs from the user-selected AppImage location without root access.
- First launch creates only required user-scoped directories and explains source access when discovery needs user action.
- Absence of Star Citizen or `game.log` is a supported empty/awaiting-source state, not an installation failure.

### Upgrade

- Normal upgrades preserve settings, telemetry, retention state, preferences, and other application data unless a separately approved migration intentionally transforms them.
- Migrations are transactional or recoverable, versioned, tested from every supported upgrade origin, and do not silently delete data.
- A failed update leaves the previously working application launchable wherever the packaging technology permits.

### Downgrade and rollback

Downgrades are best effort, not guaranteed. The application must detect data or contract versions it cannot safely read. It must then preserve the data and provide an actionable compatibility error or use a validated backward-compatible read path. It must never silently reinterpret, truncate, or overwrite newer data.

Rollback of a failed application update and downgrade of durable application data are separate operations. Release procedures must prefer restoring the prior application binary without reversing a successfully committed data migration unless that reverse migration is explicitly supported and tested.

### Uninstall and deletion

- The Windows uninstaller prompts the user to retain or delete local AstraDock data. Retain is the safe default; cancellation leaves the data untouched.
- Deletion requires an explicit choice and covers settings, canonical events, projections, caches, diagnostics, update residue, and other AstraDock-owned local data, subject to separately documented exports the user placed elsewhere.
- Failure to delete any selected path is reported precisely and does not claim successful erasure.
- Linux users remove the AppImage separately from local data. AstraDock provides an explicit local-data reset/delete workflow or exact manual XDG cleanup instructions.
- AstraDock never deletes Star Citizen files, Wine/Proton prefixes, LUG Helper configuration, or user exports as part of uninstall.

## Release channels and rollout

v0.1.0 begins as a very limited, invitation-only alpha.

- Releases are marked prerelease while the alpha channel is active.
- Access, feedback routing, known risks, unsigned-build status, supported platforms, and tested versions are communicated directly to participants.
- Rollout may be staged or paused when update, data-integrity, security, or monitoring regressions appear.
- A release is not promoted beyond the limited alpha merely because CI passes; broader distribution requires an explicit readiness decision.
- No analytics or crash upload is implied by alpha participation. Diagnostics remain local unless the user deliberately exports them.

## Release verification matrix

Every candidate release records application version, commit, Electron/Chromium/Node versions, artifact digest, signature result where applicable, operating-system version or Linux snapshot, hardware/virtualization context, display scaling, game installation layout, and pass/fail evidence.

### Full Windows regression

Run on Windows 11 x64 and Windows 10 22H2 x64:

1. Clean per-user installation without administrator privileges or developer tools.
2. First launch with no game installed and no source available.
3. Discovery from the default install and a non-default drive/location.
4. User-selected source when discovery fails.
5. Monitoring, renderer restart, application restart, log replacement/rotation, and offline operation.
6. Automatic update check, silent download, ready-on-restart state, normal restart application, and post-update data preservation.
7. Update-server unavailable, interrupted download, invalid metadata, insufficient disk, locked files, invalid signature, and unexpected publisher.
8. Failed application update and safe recovery to the previous launchable version.
9. Best-effort downgrade against compatible and incompatible newer data.
10. Uninstall with retain, delete, cancel, locked-data, and partial-deletion outcomes.
11. Supported minimum window/scaling, keyboard, screen-reader, and reduced-motion qualification as defined by the design/accessibility work.

At least one Windows 10 pass uses the owner's physical machine. Virtual machines may supplement but do not replace physical validation for native dialogs, filesystem watchers, updates, graphics, and installer behavior.

### Linux validation

For every advertised distribution/version:

1. Launch the AppImage without root privileges.
2. Verify XDG paths and user-only application-data ownership.
3. Exercise no-source, default/known Wine or Proton path, non-default prefix, and user-selected source behavior.
4. Monitor a sanitized fixture through append, partial-line, replacement, restart, and recovery paths.
5. Check, download, verify, and apply an update on normal restart; exercise offline and interrupted-update behavior.
6. Remove the AppImage, verify retained data remains, then exercise the documented data-deletion path without affecting game or compatibility-tool files.
7. Record Wayland/X11, desktop environment, filesystem, and immutable-container details where they affect results.

Full telemetry and UI regression runs on Fedora, Arch, Ubuntu, and Bazzite representatives. The remaining supported distributions require the smoke matrix above plus shared automated tests. SteamOS physical validation may use appropriate x86_64 hardware; unsupported hardware form factors do not become product requirements merely because they run SteamOS.

## Unhappy-path policy outcomes

- **Unsupported OS or architecture:** block installation where practical or show a clear unsupported message; do not fail mysteriously.
- **Non-default game path:** allow trusted user selection and remember only the approved source with privacy-safe presentation.
- **Missing signing credentials:** block signed release publication; a deliberately unsigned prerelease requires explicit release authorization and labeling.
- **Failed update:** keep monitoring and the existing version operational, retain the downloaded failure diagnostics locally, and retry with backoff.
- **Corrupt application data:** preserve the original data, avoid destructive automatic reset, and follow the persistence recovery policy from [`ADR-0003`](adr-0003-mvp-local-persistence-engine-and-retention-model.md).
- **Permission denied or locked file:** report the exact capability affected and a safe recovery action; do not request broad elevation.
- **Unvalidated Linux release:** remove that distribution from the advertised release matrix until evidence exists.

## Technology and libraries

This decision introduces no dependency by itself.

Planned implementation evaluates and pins:

- Current supported Electron, Chromium, and Node versions compatible with the approved matrix.
- Electron Builder or the approved successor integration for NSIS, AppImage, publishing, and automatic updates.
- `electron-updater` or an approved equivalent for Windows NSIS and Linux AppImage update behavior.
- NSIS for the per-user Windows installer and uninstall-data prompt.
- Windows Authenticode provider and protected CI signing integration under issue #50.
- GitHub Releases and release metadata as the initial publication/update service.
- Platform-standard signature and artifact verification tools used by release CI.

Every selection requires version, license, maintenance, supply-chain, packaging, and operational review during implementation. Mention here is not dependency approval.

## Alternatives considered

### Windows 11 only

Rejected for v0.1.0. The owner has a physical Windows 10 machine for validation, current Electron supports Windows 10+, and supporting the remaining Star Citizen user base has value. The conditional review rule prevents Windows 10 from forcing obsolete or insecure dependencies later.

### Windows portable release plus installer

Rejected as a release policy. Portable distribution adds another state, path, update, support, and verification model; it lacks the installer integration needed for the chosen automatic-update path and adds no required MVP capability. A separately invoked and clearly labeled standalone artifact is permitted only as a maintainer testing tool because it reduces cross-machine validation friction without entering publication or update flows.

### Per-machine Windows installation

Rejected. AstraDock requires no service, driver, all-users file association, privileged game mutation, or other machine-wide capability. Elevation would add risk and friction.

### Windows `.msi`, MSIX/AppX, or web installer

Rejected for the limited alpha. Enterprise deployment, Store distribution, and download-stub installation are not MVP requirements and would expand validation and update paths.

### Linux `.deb` only

Rejected. It cannot cover the approved Fedora, Arch, openSUSE, Gentoo, NixOS, Bazzite, or SteamOS environments.

### Linux AppImage plus `.deb`

Deferred. A second Linux artifact adds build, install, uninstall, update, and verification work without adding application capability during the limited alpha. Reconsider using measured demand.

### Forced immediate restart after update

Rejected. It could interrupt live monitoring and the player's active session. Silent application on the next normal restart preserves automatic delivery without disrupting collection.

### Defer signing until 1.0

Rejected. Signed Windows artifacts and a protected update trust chain are required during v0.1.0 under issue #50. Only narrowly distributed prerelease alpha artifacts may temporarily be unsigned.

## Consequences

### Positive

- Users and implementers receive explicit support and artifact contracts.
- Windows installation requires no administrator privileges.
- One artifact per operating-system family limits alpha release complexity.
- Maintainers can exercise supported Windows machines before installer qualification without confusing test output with a release artifact.
- Automatic updates do not interrupt monitoring.
- Windows 10 remains available without becoming a permanent constraint on security or runtime currency.
- Linux support aligns with actual Star Citizen community environments rather than one package ecosystem.

### Costs and risks

- The Linux matrix is materially expensive to validate and requires access to rolling, source-based, and immutable environments.
- AppImage desktop integration is less native than distribution packages.
- Temporary unsigned Windows alpha builds create trust warnings until issue #50 completes.
- GitHub Releases availability and release metadata become operational dependencies for updates.
- Windows 10 support must be reviewed continuously because upstream and Microsoft support have changed.
- The standalone build is a second packaging path that can drift; automated policy checks and focused smoke testing are required.

## Follow-up requirements

- Issue #45 implements and validates the selected artifacts and release automation.
- Issue #50 acquires and integrates Windows code signing before v0.1.0 completion.
- [`ADR-0003`](adr-0003-mvp-local-persistence-engine-and-retention-model.md) defines durable-data formats, migrations, corruption recovery, and deletion internals consistent with this lifecycle policy.
- [`ADR-0004`](adr-0004-mvp-performance-and-reliability-objectives.md) supplies numeric update, startup, recovery, resource, and soak thresholds.
- Source-discovery work implements non-default Windows drives and Linux Wine/Proton/LUG paths without broad filesystem authority.
- User and release documentation must list exact tested platform versions, artifact instructions, update behavior, data locations, uninstall behavior, and known limitations.

## Decision references

- [Electron planned breaking changes](https://www.electronjs.org/docs/latest/breaking-changes) — current Electron requires Windows 10 or later and documents platform removals.
- [Microsoft Windows 10 end-of-support guidance](https://www.microsoft.com/en-us/windows/end-of-support) — establishes the conditional security/support status of Windows 10.
- [electron-builder target selection](https://www.electron.build/docs/targets/) — compares NSIS, portable, AppImage, and other artifact/update characteristics.
- [electron-builder NSIS configuration](https://www.electron.build/nsis/) — documents per-user/per-machine installation and updater elevation behavior.
- [electron-builder automatic updates](https://www.electron.build/docs/features/auto-update/) — documents NSIS and AppImage updater support and publication metadata.
- [Star Citizen LUG Helper](https://github.com/starcitizen-lug/lug-helper) and [LUG recommended distributions](https://github.com/starcitizen-lug/knowledge-base/blob/main/wiki/Tips-and-Tricks.md) — establish the external Linux installation ecosystem and current recommendation set used to define the validation matrix.

## Supersession

Changes to primary platforms, advertised Linux distributions, architectures, artifact types, privilege model, update origin/application behavior, or signing completion gate require an update to this ADR or a superseding decision. Routine tested-version refreshes may update the release matrix without superseding the policy if support semantics remain unchanged.
