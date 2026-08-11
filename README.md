# AstraDock Local

Fast local Electron app for reading Star Citizen `game.log` and showing recent shard history.

## Run

```bash
npm install
npm start
```

## Build

```bash
npm run dist
```

The proof-of-concept Electron Builder config currently targets Windows `nsis`/`portable` and Linux `AppImage`/`deb`; that configuration is not the production release contract. The approved v0.1.0 policy will ship a per-user Windows x64 NSIS installer and a Linux x86_64 AppImage. See [`ADR-0002`](docs/architecture/adr-0002-mvp-platform-packaging-and-update-policy.md).

## Current Functionality

- Auto-checks common Windows and Linux Star Citizen `game.log` locations.
- Lets you choose a custom `game.log`.
- Scans for shard entries and displays shard ID, name, region, build, last seen time, and source line.
- Watches the selected log file and refreshes when it changes.
- Supports a configurable enrichment API URL using `{shardId}`, for example:

```text
https://api.example.com/shards/{shardId}
```

The parser is intentionally heuristic because Star Citizen log formats vary between builds. Inspecting a row shows the raw surrounding log context so the parser can be tightened against real logs.
