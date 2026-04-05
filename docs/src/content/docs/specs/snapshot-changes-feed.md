---
title: Snapshot Changes Feed
description: Draft relay-local bootstrap, replay, and live-follow protocol for snapshot-oriented sync events.
sidebar:
  label: Changes Feed
  order: 3
---

`draft`

Related drafts:

- [Snapshot Sync Range](/specs/snapshot-sync-range/)
- [Snapshot Retention And Compaction](/specs/snapshot-compaction/)

## Summary

This draft defines a relay-local changes feed for sync-range events.

The feed is responsible for:

- snapshot bootstrap against a stable relay snapshot
- ordered incremental replay
- reconnect after temporary disconnect
- live follow after catch-up
- relay-local checkpointing

This draft defines both:

- bootstrap of retained snapshots
- relay-tail replay and live follow after bootstrap

## Goals

- Efficient current-state bootstrap for local-first clients
- Ordered incremental sync for sync-range events
- Live updates after catch-up
- Relay-local checkpoints
- Compatibility with encrypted snapshot events
- Clear distinction between logical deletion and hard relay-side removal

## Non-Goals

- Full-history anti-entropy
- Requiring relays to decrypt payloads or compare vector clocks
- Defining application-specific payload semantics
- Defining conflict winner semantics
- Defining cross-relay comparable sequence numbers

## Core Principle

The changes feed streams accepted sync events in relay sequence order.

For sync-range events:

- event kind identifies the sync protocol family
- sync metadata identifies document scope and operation
- relay sequence identifies local acceptance order on one relay

That means a client can:

- load the retained snapshot set at a stable relay snapshot
- resume from a saved relay-local cursor
- apply newly accepted sync snapshots in order
- keep one checkpoint per relay

## Message Shape

### Client request

All requests use the same message family:

```json
["CHANGES", "<subscription-id>", <filter>]
```

### Relay status

```json
[
  "CHANGES",
  "<subscription-id>",
  "STATUS",
  { "mode": "bootstrap", "snapshot_seq": 12345 }
]
```

### Relay bootstrap snapshot event

```json
["CHANGES", "<subscription-id>", "SNAPSHOT", <event>]
```

### Relay replay or live-follow event

```json
["CHANGES", "<subscription-id>", "EVENT", <seq>, <event>]
```

### Relay end-of-stream marker

```json
["CHANGES", "<subscription-id>", "EOSE", <last_seq>]
```

### Relay error

```json
["CHANGES", "<subscription-id>", "ERR", "<message>"]
```

## Filter Shape

Bootstrap and changes filters should support:

- `mode`
- `since`
- `until_seq`
- `limit`
- `kinds`
- `authors`
- `#<tag>`
- `live`

Recommended meaning:

- `mode`: `"bootstrap"` or `"tail"`
- `since`: relay-local sequence cursor; return entries with `seq > since`
- `until_seq`: upper inclusive relay-local sequence bound
- `limit`: maximum number of replayed entries
- `kinds`: explicit sync kinds to include
- `authors`: sync namespaces to include
- `#<tag>`: filter on sync metadata tags
- `live`: keep the subscription open for future accepted events after replay finishes

## Sync-Range Constraints

This feed is intended for sync-range events.

Recommended rules:

- `mode` is required
- `kinds` is required
- each requested kind must be inside the reserved sync range
- clients should use metadata filters such as `#d`, `#o`, and `#c` only with sync-range kinds

Typical replay filters:

```json
{
  "mode": "tail",
  "since": 0,
  "kinds": ["<sync-kind>"],
  "authors": ["<pubkey>"]
}
```

```json
{
  "mode": "tail",
  "since": 2500,
  "kinds": ["<sync-kind>"],
  "authors": ["<pubkey>"],
  "#d": ["<document-coord>"],
  "live": true
}
```

For the first Comet note profile, the concrete sync kind is `42061`.

For bootstrap:

- `since` and `until_seq` are not required
- `mode` should be `"bootstrap"`
- relays should interpret the filter as a retained-snapshot query at one stable snapshot

## Bootstrap Semantics

Bootstrap is snapshot-oriented.

When a relay accepts a `CHANGES` request with `mode = "bootstrap"`, it should:

1. validate the filter as a sync-range bootstrap filter
2. capture `snapshot_seq`
3. resolve the retained sync snapshots matching the filter at that snapshot
4. send `STATUS` with `snapshot_seq`
5. stream one `SNAPSHOT` event per retained matching snapshot
6. send `EOSE` with `last_seq = snapshot_seq`

Important semantics:

- the returned events are the retained snapshots at `snapshot_seq`
- events accepted after `snapshot_seq` are outside the bootstrap snapshot
- the relay is not required to know which encrypted snapshots are current or concurrent
- the client compares payload metadata such as vector clocks after decrypting the returned snapshots

Bootstrap does not attempt full-history reconciliation.

Bootstrap is retained-snapshot-only in this version of the draft.

Clients may materialize a bounded local note-history feature from retained snapshots, but that history is a client feature layered on top of bootstrap and replay rather than a distinct transport concept.

## Sequence Model

`seq` values are relay-local.

That means:

- the client must keep one cursor per relay
- two relays may assign different `seq` values to the same sync event
- cross-relay convergence happens through note identity plus decrypted payload metadata, not through `seq`

The feed is ordered by relay acceptance, not by `created_at`.

That distinction matters:

- `created_at` belongs to the event
- `seq` belongs to the relay
- reconnect and replay use `seq`, not event timestamps

## EOSE And Checkpoints

After replaying the requested range, or after completing bootstrap snapshot delivery, the relay should send:

```json
["CHANGES", "<subscription-id>", "EOSE", <last_seq>]
```

Clients should persist `last_seq` as the relay-local checkpoint.

If `live` is `true`, the relay keeps the subscription open after `EOSE` and continues emitting future accepted sync events for the subscription filter.

## Bootstrap Handoff Into Tail Replay

The purpose of bootstrap `snapshot_seq` is to avoid a race window between bootstrap snapshot loading and relay-tail replay.

Recommended client flow:

1. open `CHANGES` with `mode = "bootstrap"`
2. receive `snapshot_seq = S`
3. load and decrypt all returned bootstrap events
4. compare their payload metadata, such as vector clocks, with local note state
5. apply remote snapshots that dominate local state
6. surface concurrent snapshots as conflicts
7. upload missing or newly merged local snapshots only after conflict/policy evaluation
8. start `CHANGES` with `mode = "tail"`, `since = S`, and `live = true`
9. continue from the relay tail

Bootstrap is concerned with current and retained snapshot transport only.

- it is not a full-history protocol
- it is not a local history UI protocol
- clients may keep a bounded local history window from retained snapshots after apply

This gives the protocols clear responsibilities:

- `CHANGES` in bootstrap mode answers "what retained sync snapshots existed at snapshot `S`?"
- `CHANGES` in tail mode answers "what happened after snapshot `S`?"

## Logical Delete vs Hard Delete

Logical document deletion must flow through a normal sync event:

```text
["o", "del"]
```

That is protocol-level deletion.

Clients maintaining logical state should treat `o=del` as authoritative for document deletion.

## Client Apply Rules

When a client receives a sync event through bootstrap or the changes feed, it should:

- validate that the event kind is inside the reserved sync range
- validate required sync metadata
- decrypt the payload for concrete profiles that require local comparison
- compare the incoming snapshot against local state using profile-defined ordering metadata such as vector clocks
- apply dominating snapshots
- ignore stale dominated snapshots
- treat nondominated concurrent snapshots as real conflicts until application logic resolves them

The changes feed does not define any built-in winner among conflicting snapshots.

Recommended client behavior for unresolved concurrent state:

- make the document read-only
- require explicit user resolution before further editing continues on that document

## Relay Expectations

For the simple local-first model, the relay should:

- store and replay encrypted sync snapshots
- filter by relay-visible sync metadata only
- maintain relay-local `seq` ordering
- avoid deriving current state from encrypted payloads

This keeps the relay simple and lets the client compare vector clocks after decryption.

## Retention And Compaction

This model supports payload compaction and replay retention limits, but this draft does not fully define them.

Important compatibility point:

- relay-local `seq` replay is only meaningful inside the relay's retained history window

Recommended future advertisement fields include:

- a minimum retained `seq`
- any snapshot-retention boundary if older dominated snapshots may be compacted

If a client has fallen behind the retained replay window, the client should fall back to bootstrap rather than assume the feed alone can restore full state.

Snapshot bootstrap is intentionally more compaction-friendly than full-history repair.

## Open Questions

- Should the feed later expose metadata-only replay modes in addition to full events?
- How should relays advertise replay and payload retention boundaries?

## Future Work

- Define replay retention advertisement
- Define compaction signaling for historical fetches
- Define concrete application profiles on top of sync-range events
