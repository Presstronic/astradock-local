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

The Electron Builder config currently targets Windows `nsis`/`portable` and Linux `AppImage`/`deb`.

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
