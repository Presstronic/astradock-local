# AstraDock Local Session Handoff - 2026-08-09

## Purpose

This document summarizes the planning discussion from August 9, 2026 so a fresh
agent can continue the AstraDock Local work on another machine.

## Project Direction

AstraDock Local has two major roles:

1. **Star Citizen session intelligence**
   - Watch the local Star Citizen `game.log`.
   - Keep a running history of meaningful in-game events during play sessions.
   - MVP targets include shard changes, server/session joins, deaths, kills,
     vehicle activity, visited locations, login/logout, and other events that can
     later support session summaries and animated star maps.

2. **LIVE game data ingestion for Station**
   - Detect when the Star Citizen LIVE/PU game client receives a new patch,
     hotfix, or update.
   - Use tools such as `unp4k` and possibly `StarBreaker` to extract game data
     from the current client files.
   - Transform the extracted data into a versioned dataset and push it to the
     Station REST API.

## Data Of Interest

The user wants to capture, where available:

1. Shard
2. Server
3. Mission
4. Kill
5. Death
6. Ship
7. Trade
8. Login
9. Logout
10. Quantum Status
11. Jump Tunnel Status
12. Organization Member Status Updates
13. Server Ping
14. Chat

Some of these may not currently appear in `game.log`; they should be treated as
future-development targets until real evidence is captured.

## Public `game.log` Research

The session reviewed public examples and tooling references, including:

- Public `game.log` sample from July 19, 2025:
  <https://pastebin.com/p4ii24JT>
- Star Citizen log monitor gist:
  <https://gist.github.com/KelSolaar/83373288538a6ad3ec24985c1bcb230d>
- Support-derived `game.log` notes:
  <https://sites.google.com/view/sessioncouncil>
- Gunhead Connect:
  <https://gunhead.space/connect-app>
- Schaulers guide mentioning shard detection:
  <https://schaulers.space/guide>

Important caveat: the public raw `game.log` sample found was older. The user
correctly pointed out that Star Citizen has had major log/runtime changes over
the last 12-18 months, so older log examples must not be treated as current
truth.

## Feasibility Triage From Available Evidence

| Data Item | Feasibility | Notes |
| --- | --- | --- |
| Shard | Likely, but version-sensitive | Older logs expose session/shard-adjacent identifiers. Modern logs need fresh samples. |
| Server | Partial | We may capture session/server fingerprints before stable server IDs. |
| Mission | Partial | Mission module initialization appears in older evidence, but not accepted mission/objective tracking. |
| Kill | Likely | Public parser examples handle actor death lines that include victim/killer details. |
| Death | Likely | Same actor death events can classify player death when the player is the victim. |
| Ship | Partial | Vehicle destruction appears parsable. Enter/exit/current ship needs current samples. |
| Trade | Not proven | No reliable public evidence found for purchases, sales, cargo trades, or money transfers in `game.log`. |
| Login | Likely | Client startup, connect, and spawn events appear in known parsers/samples. |
| Logout | Partial | Lobby quit/disconnect can be detected, but normal exit/crash cases need samples. |
| Quantum Status | Weak/partial | Direct status lines were not proven. Location transitions may be indirect evidence. |
| Jump Tunnel Status | Unknown | Needs newer 4.x samples. |
| Organization Member Status Updates | Not proven | Presence/social service setup may appear, but org member events were not proven. |
| Server Ping | Not proven | Network setup lines appear, but clean ping metrics were not proven. |
| Chat | Not proven | No public raw `game.log` chat evidence was found. |

## Shard Data Discussion

From the older sample, shard-related data looked more like trace/session
identity than a rich game-shard object:

- `@session`: local/client trace session ID
- `@env_session`: environment session/build deployment identifier
- `@host_session`: host session label, such as `local_shard`
- environment tag such as `PUB`
- service endpoints such as `*.cloudimperiumgames.com:443`
- build metadata including file version, product version, branch, and changelist

The existing code currently expects cleaner fields such as `ShardID`,
`ShardName`, `Region`, `Build`, `shardId`, or `server_name`. That may be too
optimistic for current logs and should be treated as heuristic legacy support
until modern samples confirm it.

## Existing Code State

Current parser entry points are in:

- `src/logParser.js`
- `test/logParser.test.js`

Current behavior:

- Auto-detects common `game.log` paths.
- Scans for heuristic shard entries.
- Displays shard ID, shard name, region, build, last seen time, and raw source
  line.
- Watches the selected log file and refreshes on changes.
- Has a basic enrichment API URL placeholder using `{shardId}`.

Important current implementation details:

- `extractShardInfoFromLine` hardcodes several regexes for fields such as
  `ShardID`, `shardId`, `ShardName`, `Region`, and `Build`.
- `extractServerJoinFromLine` expects a `<Join PU>` line with bracketed values
  such as `address`, `port`, `shard`, and `locationId`.
- These assumptions may not match current Star Citizen logs.

## Desired Architecture Direction

The user wants to avoid changing application code every time CIG changes
`game.log` wording or structure.

The agreed direction:

```text
Raw game.log line
  -> log format/profile detection
  -> extraction profile
  -> stable canonical event DTO
  -> app/UI/storage/Station sync
```

The application should consume stable canonical objects such as:

```js
{
  type: 'ShardObserved',
  observedAt: '2026-08-09T12:34:56Z',
  shardId: '...',
  serverId: '...',
  region: '...',
  build: '...',
  confidence: 'high',
  evidence: {
    lineNumber: 123,
    rawLine: '...'
  }
}
```

The unstable, patch-specific vocabulary should live outside normal application
logic, in configurable extraction definitions. The user did not like the term
"parser map"; better candidate terms discussed were:

- extraction profile
- log profile
- event profile
- log schema adapter

Avoid saying "parser map" unless the user reintroduces that term.

## Important Design Constraint

The user is **not** asking to put business logic in JSON. The desired
configuration should contain only mapping/extraction knowledge:

- what line shapes identify an event
- which canonical event type they map to
- where canonical fields can be extracted from
- fallback paths or aliases for a field
- required-field and confidence metadata

Application code should still own:

- file reading/tailing
- JSON/text detection
- regex or Grok execution
- context tracking across nearby lines
- validation
- confidence assignment
- canonical DTO emission
- persistence and UI behavior

## Open Source Libraries Discussed

The session looked for known open-source tools that fit this parsing and
normalization problem.

Shortlist:

| Library/Approach | Use |
| --- | --- |
| Grok / Logstash-style patterns | Best fit for semi-structured raw text log lines. Uses reusable named regex patterns. |
| JSONPath / JMESPath | Good for extracting values from JSON-like payloads after a line is parsed as JSON. |
| JSONata | Powerful JSON query/transformation language; may be more than needed initially. |
| Vector Remap Language (VRL) | Highly relevant for observability event transformation, but likely too heavy to embed now. |
| Drain / LogPAI | Good later for mining a corpus and discovering log templates automatically. |
| Jolt | Useful JSON-to-JSON transformation concept, but Java-centric and less suitable for raw text logs. |

Recommendation from the session:

1. Investigate Grok-style named patterns first for raw `game.log` text.
2. Pair with JSONPath or JMESPath for JSON-like payloads.
3. Keep a stable canonical event contract in code.
4. Consider Drain/LogPAI later for sample-corpus analysis and pattern discovery.

Useful references:

- Elastic Grok docs:
  <https://www.elastic.co/docs/solutions/observability/logs/streams/management/extract/grok>
- JSONPath Plus:
  <https://www.npmjs.com/package/jsonpath-plus>
- JMESPath:
  <https://jmespath.org/>
- JSONata:
  <https://jsonata.org/>
- VRL:
  <https://github.com/vectordotdev/vrl>
- Drain / LogPAI:
  <https://github.com/logpai/logparser>

## Likely Next Issues

Suggested issue breakdown:

1. **Define canonical event DTOs**
   - Create stable app-facing event types.
   - Include evidence, confidence, source profile, line number, raw line, and
     timestamp fields.

2. **Build a log sample corpus**
   - Store sanitized snippets by Star Citizen version/build.
   - Include known-good examples for shard/session, login, death, vehicle, and
     unknown interesting lines.

3. **Introduce extraction profiles**
   - Add profile files under a name such as `src/extractionProfiles/`.
   - Support text pattern extraction and JSON path extraction.
   - Keep profiles declarative.

4. **Replace hardcoded shard regexes with profile-backed extraction**
   - Preserve existing behavior through a generic/legacy profile.
   - Add tests proving app-facing DTOs stay stable when source field names
     differ.

5. **Add unknown-interesting-line capture**
   - Retain lines containing keywords such as shard, server, mission, quantum,
     jump, vehicle, actor, death, chat, currency, transfer, inventory, and
     location.
   - Use these retained lines to improve future profiles.

6. **Add current Star Citizen log review workflow**
   - Once the user has access to a Windows machine with Star Citizen installed,
     capture a fresh current LIVE `game.log`.
   - Sanitize it.
   - Add representative snippets to the corpus.
   - Update extraction profiles based on current evidence.

## Suggested Skills For Next Agent

- `codebase-design`: for shaping the canonical event seam and extraction-profile
  module.
- `domain-modeling`: for naming event types and maintaining stable project
  vocabulary.
- `implement`: when ready to add the extraction-profile module.
- `tdd`: useful for introducing profile-backed parser behavior without breaking
  existing parsing.
- `github:yeet`: for future branch/commit/push/PR flows.

## Immediate Next Step

Start by designing the canonical event contract and adding tests that show two
different source log shapes produce the same canonical DTO. That proves the
intended protection against patch-specific log changes before broadening the
parser implementation.
