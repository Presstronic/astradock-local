# Star Citizen server-meshing reference

## Purpose and status

This document records the working model AstraDock uses when discussing Cloud Imperium Games' (CIG) server-meshing architecture. It separates currently deployed behavior, publicly described transitional work, the intended end state, and AstraDock-specific conclusions.

| Field | Value |
| --- | --- |
| Status | Research reference; not an implementation contract |
| Last reviewed | 2026-08-18 |
| Primary-source horizon | CIG publications available through April 2026 |
| Related AstraDock projection | [`pu-shard-server-session-projections.md`](pu-shard-server-session-projections.md) |

CIG's architecture and terminology are still evolving. A historical presentation can establish direction without proving that its internal names, rollout stages, or exact allocation algorithms remain current. Any future implementation must be based on sanitized `game.log` evidence from the relevant game build rather than this document alone.

## Executive model

The publicly described progression is:

```text
fixed territory-to-server assignments
    -> load-aware assignment of predefined areas
    -> compute allocated around actual simulation demand
    -> finer interaction-based simulation islands
```

In practical terms:

1. **Static Server Meshing (SSM)** lets several Dedicated Game Servers simulate one shard, but assigns them to predetermined territories or entity zones.
2. **Quasi-Dynamic Server Meshing (QDSM)** is the transitional system CIG is testing to distribute areas across DGS instances according to load while the world is still divided into defined areas.
3. **Full Dynamic Server Meshing (DSM)** is intended to place and scale simulation capacity where demand exists rather than treating a fixed territory layout as the primary allocation constraint.
4. CIG's earlier description of the most advanced stage further divides an entity zone into **simulation islands**, grouping objects that can interact or collide so those groups can be distributed across servers.

## Core concepts

### Shard

A shard is the logical persistent-universe instance shared by a population of players. It is not synonymous with one DGS, one network endpoint, or one client connection. Multiple DGS instances can participate in the same shard.

The shard's entity state is decoupled from any individual DGS through CIG's persistence and replication architecture. This separation is what permits simulation authority to move between servers without requiring the logical universe to become a different shard.

### Dedicated Game Server (DGS)

A DGS performs authoritative simulation for some portion of a shard. Its assignment and lifetime are infrastructure details and become increasingly dynamic as CIG progresses from static to dynamic meshing.

A server address, node name, or process identifier is therefore an observation about current simulation or transport infrastructure. It must not be treated as a permanent identity for a shard, location, or player session.

### Replication Layer and Hybrid service

CIG separated replicated universe state from the game-server process before deploying server meshing. The Replication Layer mediates state between clients and the DGS instances participating in a shard. Current CIG reports also refer to the replication layer's **Hybrid** service.

These services matter to AstraDock because a DGS failure, replacement, or authority transfer does not necessarily mean that the player changed shards or began a new logical PU session.

### Entity zones, territories, and authority

CIG describes entity zones, sometimes called local grids, as nested simulation areas. Examples include a star system, a planet, a landing zone, the space around a ship, and the interior grid of that ship.

A server with authority over an entity is responsible for its authoritative simulation. As entities move through the universe, authority can pass between DGS instances. The exact relationship among CIG's internal territory, entity-zone, authority, and server-assignment representations is not a public external contract and must not be reconstructed from terminology alone.

## Node-based world and ownership hierarchies

“Node” does not refer to Node.js in this document. CIG uses node-oriented and hierarchical models in several related layers. They should be understood together, but they are not interchangeable:

| Layer | What its nodes or relationships represent | Why it matters to meshing |
| --- | --- | --- |
| Object Container hierarchy | Authored world/content containers nested inside larger containers | Lets clients and servers stream bounded parts of the world in and out |
| Zone/local-grid hierarchy | Nested spatial and simulation frames, such as system, planet, ship exterior, and ship interior | Supplies meaningful boundaries and coordinate frames over which authority can be distributed |
| Entity Ownership Hierarchy | Runtime parent/child relationships among dynamic entities | Keeps related entities together and preserves dependency order when they stream, spawn, move, attach, or detach |
| Entity Aggregates | A related dynamic entity group treated as a unit for relevant streaming/network operations | Prevents a dependent entity from becoming active without the root or group that defines its state |
| EntityGraph | Persistent graph representation of replicated entity state and relationships | Allows state and relationships to survive beyond the lifetime or memory ownership of one DGS |
| Server nodes and their views | DGS participants in the mesh; one can hold authority while others have a replicated view | Allows several DGS instances to share awareness while only the authority owner performs authoritative simulation |

### Authored hierarchy versus runtime ownership

Object Containers primarily divide authored static content into nested building blocks. The Entity Ownership Hierarchy handles relationships that can change at runtime. Examples include:

- a weapon and its attachments;
- a player holding or carrying an item;
- a vehicle or smaller ship inside another ship; and
- a ship composed of multiple dependent entities or object containers.

These relationships affect both streaming and correctness. If an inner ship's state depends on the outer ship, the inner entity cannot be loaded and activated as though it were an unrelated root. CIG groups related entities into Entity Aggregates and uses ordered spawn/state data so the aggregate can become usable coherently.

The important consequence is that “where is this entity?” cannot always be represented safely as one flat location string. An entity can have a spatial container, an ownership parent, an aggregate root, a persistent EntityGraph node, and a current authority-owning server node at the same time. Those relationships can change independently.

### Hierarchy and dynamic meshing

The hierarchy gives CIG units that can be streamed and moved between authority owners without treating every component as unrelated. Dynamic meshing can then evaluate how to distribute simulation while respecting interaction and dependency boundaries.

Conceptually:

```text
shard
└── nested world / zone structure
    └── entity aggregate root
        ├── dependent or attached entity
        └── nested aggregate or grid

authority overlay at time T
├── DGS node A: authoritative for selected roots/zones
├── DGS node B: authoritative for other roots/zones
└── participating nodes: replicated views where required
```

This diagram is a conceptual separation, not a claim that CIG stores one literal tree in this exact shape. The public material supports multiple graph/hierarchy concepts and an authority overlay; it does not publish a complete current internal schema.

### Implications for AstraDock data contracts

AstraDock should treat every logged “node” according to an explicit namespace and kind. A bare `nodeId` field would be ambiguous and unsafe. Where evidence permits, normalized observations should distinguish values such as:

- `serverNodeId`;
- `entityGraphNodeId`;
- `entityId` and `aggregateRootEntityId`;
- `zoneId`, `localGridId`, or `objectContainerId`;
- `territoryId`; and
- the observed relationship or authority role.

Parentage and authority are time-varying edges, not immutable properties. If logs expose them, AstraDock should record observations such as entity attached, entity detached, aggregate root changed, zone/grid changed, authority acquired, authority transferred, and authority lost. It should not synthesize a permanent path or assume that ownership parent, spatial parent, and authority owner are the same relationship.

Unknown node kinds must remain opaque observations until build-specific evidence establishes their meaning. Reuse of the same textual identifier across different node namespaces must not cause correlation, deduplication, or history to collapse.

## Static Server Meshing

Static Server Meshing was delivered to players with Alpha 4.0. It allows multiple DGS instances to simulate different predefined parts of the same shard and enables seamless travel across server-authority boundaries, including travel between star systems.

The defining constraint is not that the player remains connected to one server. It is that the server-to-world partition is configured ahead of demand. Capacity assigned to an empty area cannot automatically solve overload in a crowded area, and an unexpectedly concentrated population can overload the DGS responsible for that predefined territory.

Static meshing nevertheless establishes the essential foundations that later stages reuse:

- multiple authoritative DGS instances participating in one shard;
- state held independently from an individual DGS;
- entity-authority transfer between servers;
- cross-boundary replication and client handoff;
- server crash recovery and replacement mechanisms; and
- mesh-aware game systems that cannot assume one server owns the whole universe.

## Quasi-Dynamic Server Meshing

QDSM is CIG's official term for the intermediate system under active development and testing. CIG reported work on `QDSM V1/V2` in February 2026 and described QDSM in March as intelligently distributing game-world areas across dedicated servers based on current load.

Earlier engineering reporting explains the transition in more detail: DGS assignment was being separated from the Territory Manager so runtime redistribution could consider entity distribution, player distribution, and total shard occupancy. CIG stated that later work would remove territories from the equation and deploy compute exactly where needed.

The defensible interpretation is that QDSM makes allocation of defined areas dynamic before the simulation itself becomes independent of fixed territorial divisions. This should improve utilization and permit servers to be assigned, reassigned, started, or stopped in response to demand.

The following details are **not sufficiently documented as stable public contracts**:

- the exact behavioral difference between QDSM V1 and V2;
- the load metrics and thresholds used for redistribution;
- whether every reassignment is visible to a client or `game.log`;
- whether boundaries move, areas are regrouped, or only DGS assignments change in a given iteration;
- timing, hysteresis, warm-up, draining, and failure-recovery policies; and
- which QDSM behavior is present in each release channel and build.

AstraDock must label any conclusion about those details as an inference until direct build-specific evidence or clearer CIG documentation exists.

## Full Dynamic Server Meshing

The end state is demand-driven simulation capacity. A crowded or simulation-heavy location should be able to receive more compute without being limited to the capacity of the one DGS statically assigned to that location. Empty areas should not require permanently allocated DGS capacity.

CIG's 2022 roadmap described two conceptual stages:

- **DSM V1:** dynamically assign servers to entity zones according to gameplay and simulation load.
- **DSM V2:** divide entity zones into simulation islands based on which dynamic objects can interact or collide, then distribute those islands among servers to balance load more finely.

These stages explain the intended destination, but their labels should be treated as historical roadmap terminology rather than a promise that current development will ship under the same names or boundaries. The more recent territory-redistribution and QDSM descriptions refine the path without publicly specifying a complete final algorithm.

## What can and cannot be inferred from a client log

The following are distinct facts and must remain distinct in AstraDock's model:

| Observation or inference | What it does not prove by itself |
| --- | --- |
| A client connected to a server endpoint | Stable DGS, location, shard, or session identity |
| The endpoint or server node changed | Shard change, PU leave, or player-visible reconnect |
| The player entered another zone | DGS or shard change |
| Entity authority changed | Player connection, DGS process, or shard changed |
| A DGS disconnected or was replaced | The logical PU session ended |
| A shard label was observed | Complete shard topology or current server assignment |
| A territory or zone name was logged | A stable CIG identifier or permanent mesh boundary |
| A node or parent identifier was logged | Whether it is a server, EntityGraph, ownership, spatial, or container node |
| An entity's parent changed | Whether spatial containment, logical ownership, attachment, or authority changed |
| Performance degraded | Which mesh component or load condition caused it |

Conversely, an uninterrupted client experience does not prove that the underlying DGS, authority owner, or territory assignment remained unchanged.

## AstraDock architecture implications

Future log tracking should model independently:

- logical PU session lifecycle;
- shard observations and confidence;
- client transport connections and endpoints;
- observed DGS or node identity, when present;
- zone, local-grid, and territory observations without conflating their meanings;
- entity hierarchy, aggregate-root, attachment, and containment observations without conflating their edge types;
- authority-transfer evidence, if the client exposes it;
- Replication Layer or Hybrid transitions and recovery signals;
- server replacement, reassignment, and reconnect evidence;
- game channel, build, source profile, and parser version; and
- raw observed facts versus AstraDock-derived correlations.

Stable internal identities should be AstraDock-owned correlation identifiers. CIG-provided values should be stored as typed, opaque observations with their source timestamp, ingestion timestamp, provenance, confidence, source profile, build, and bounded evidence reference.

Parsers and projections should therefore:

- avoid making endpoint, node, territory, or zone vocabulary part of an irreversible primary key;
- namespace node identifiers and relationship types instead of exposing an ambiguous generic node field;
- represent parentage, containment, and authority as time-varying observations rather than one canonical hierarchy path;
- permit zero, one, or many DGS observations during one logical PU session;
- preserve unknown transitions instead of coercing them into join or disconnect events;
- version build-specific extraction profiles independently from normalized event contracts;
- retain unrecognized mesh-related records locally for controlled fixture review;
- base promotion to canonical events on sanitized representative evidence;
- keep observed events separate from derived topology or lifecycle conclusions; and
- make confidence degradable when only part of a transition is visible.

This lets AstraDock add richer mesh telemetry without binding its durable schema or user-facing concepts to today's log wording or territory implementation.

## Open research questions

Before specifying new mesh events, obtain sanitized logs covering as many of these cases as practical:

1. Normal travel across known static server boundaries.
2. DGS crash recovery without a shard change.
3. Reconnection to a replacement DGS.
4. QDSM territory reassignment or server spin-up/spin-down visible to a client.
5. Zone or authority changes involving a ship interior and its surrounding space.
6. Entity attachment, detachment, aggregate-root, and ownership-parent changes.
7. Nested vehicle or ship transitions where spatial, ownership, and authority relationships may differ.
8. Party members crossing boundaries together and separately.
9. Client startup mid-session, missing transition records, and truncated logs.
10. LIVE, PTU, EPTU, and Tech Preview differences for the same conceptual transition.

The log vocabulary, identifier stability, ordering, partial-failure behavior, and privacy content of those records remain evidence questions rather than settled requirements.

## Primary sources

- CIG, [Letter From the Chairman, December 2022](https://robertsspaceindustries.com/en/comm-link/transmission/19078-Letter-From-The-Chairman): Replication Layer separation; static entity-zone assignments; DSM V1; simulation-island-based DSM V2.
- CIG, [Server Meshing and Persistent Streaming Q&A, November 2021](https://robertsspaceindustries.com/en/comm-link/transmission/18397-Server-Meshing-And-Persistent-Streaming-Q-A): shards, entity authority, authority transfer, server nodes, and dynamic allocation direction.
- CIG, [Letter From the Chairman, May 2022](https://robertsspaceindustries.com/en/comm-link/transmission/18696-Letter-From-The-Chairman): EntityGraph graph-database direction, Replication Layer separation, and multiple server nodes sharing focused simulation of one universe.
- CIG, [OCS Boot Camp, Jump Point 7.10, October 2019](https://robertsspaceindustries.com/comm-link/transmission/17329-Jump-Point-Now-Available): CIG's Entity Ownership Hierarchy, Entity Aggregates, spawn ordering, and streaming foundations. Access to the full Jump Point issue may require an eligible RSI subscription.
- CIG, [Inside Star Citizen: Dev Diary — Server Meshing, July 2024](https://www.youtube.com/watch?v=pCPaSkcK3mM): server-meshing implementation and Alpha 4.0 test context.
- CIG, [Letter From the Chairman, December 2024](https://robertsspaceindustries.com/en/comm-link/transmission/20371-Letter-From-The-Chairman): confirmation that server meshing shipped with Alpha 4.0.
- CIG, [PU Monthly Report, May 2025](https://robertsspaceindustries.com/en/comm-link/transmission/20620-Star-Citizen-Monthly-Report-May-2025): separating DGS assignment from the Territory Manager; load factors; eventual removal of territory constraints.
- CIG, [PU Monthly Report, February 2026](https://robertsspaceindustries.com/en/comm-link/transmission/21043-Star-Citizen-Monthly-Report-February-2026): QDSM V1/V2 development and testing.
- CIG, [PU Monthly Report, March 2026](https://robertsspaceindustries.com/en/comm-link/transmission/21094-Star-Citizen-Monthly-Report-March-2026): QDSM load-aware distribution, test findings, server-management stability, and next-generation Territory Manager work.
- CIG, [PU Monthly Report, April 2026](https://robertsspaceindustries.com/en/comm-link/transmission/21159-Star-Citizen-Monthly-Report-April-2026): newer server-meshing components merged into the main game build and Hybrid-service stability work.
- Community-maintained secondary reference, [Unofficial Road to Dynamic Server Meshing](https://sc-server-meshing.info/): cross-referenced overview of Entity Ownership Hierarchy, Entity Aggregates, EntityGraph, server nodes, and meshing prerequisites. This is useful for source discovery but is not authoritative CIG documentation.

## Maintenance rule

Review this document when CIG publishes a material server-meshing architecture update, when a new meshing stage reaches a public test channel, or when accepted sanitized logs contradict this model. Record the review date and source horizon even if no conclusions change.
