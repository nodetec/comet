---
title: Sync Changes Feed
description: Draft relay-local bootstrap, replay, and live-follow protocol for sync-range events.
sidebar:
  label: Changes Feed
  order: 3
---

`draft`

Related drafts:

- [Revision Sync Range](/specs/revision-sync-range/)
- [Sync Retention And Compaction](/specs/revision-compaction/)

## Summary

This draft defines a relay-local changes feed for sync-range events.

The feed is responsible for:

- current-head bootstrap against a stable relay snapshot
- ordered incremental replay
- reconnect after temporary disconnect
- live follow after catch-up
- relay-local checkpointing

This draft defines both:

- bootstrap of current heads
- relay-tail replay and live follow after bootstrap

## Goals

- Efficient current-state bootstrap
- Ordered incremental sync for sync-range events
- Live updates after catch-up
- Relay-local checkpoints
- Compatibility with immutable revision events
- Clear distinction between logical deletion and hard relay-side removal

## Non-Goals

- Full-history anti-entropy
- Historical repair of every superseded revision
- Defining application-specific payload semantics
- Defining conflict winner semantics
- Defining cross-relay comparable sequence numbers

## Core Principle

The changes feed streams accepted sync events in relay sequence order.

For sync-range events:

- event kind identifies the sync protocol family
- sync metadata identifies document and revision relationships
- relay sequence identifies local acceptance order on one relay

That means a client can:

- load the current head set at a stable relay snapshot
- resume from a saved relay-local cursor
- apply newly accepted revisions in order
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

### Relay bootstrap head event

```json
["CHANGES", "<subscription-id>", "HEAD", <event>]
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
- clients should use metadata filters such as `#d`, `#r`, `#b`, `#o`, and `#c` only with sync-range kinds

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
- relays should interpret the filter as a current-head query at one stable snapshot

## Bootstrap Semantics

Bootstrap is current-head-oriented.

When a relay accepts a `CHANGES` request with `mode = "bootstrap"`, it should:

1. validate the filter as a sync-range bootstrap filter
2. capture `snapshot_seq`
3. resolve the current materialized heads matching the filter at that snapshot
4. send `STATUS` with `snapshot_seq`
5. stream one `HEAD` event per matching current head
6. send `EOSE` with `last_seq = snapshot_seq`

Important semantics:

- the returned events are the current heads at `snapshot_seq`
- events accepted after `snapshot_seq` are outside the bootstrap snapshot
- if multiple heads exist for one document, the relay should return all of them

Bootstrap does not attempt full-history reconciliation.

Bootstrap is current-head-only in this version of the draft.

Reduced or metadata-only bootstrap modes are deferred.

## Sequence Model

`seq` values are relay-local.

That means:

- the client must keep one cursor per relay
- two relays may assign different `seq` values to the same sync event
- cross-relay convergence happens through event identity and sync metadata, not through `seq`

The feed is ordered by relay acceptance, not by `created_at`.

That distinction matters:

- `created_at` belongs to the event
- `seq` belongs to the relay
- reconnect and replay use `seq`, not event timestamps

## EOSE And Checkpoints

After replaying the requested range, or after completing bootstrap head delivery, the relay should send:

```json
["CHANGES", "<subscription-id>", "EOSE", <last_seq>]
```

Clients should persist `last_seq` as the relay-local checkpoint.

If `live` is `true`, the relay keeps the subscription open after `EOSE` and continues emitting future accepted sync events for the subscription filter.

## Bootstrap Handoff Into Tail Replay

The purpose of bootstrap `snapshot_seq` is to avoid a race window between current-head loading and relay-tail replay.

Recommended client flow:

1. open `CHANGES` with `mode = "bootstrap"`
2. receive `snapshot_seq = S`
3. load and apply all returned head events
4. compare the returned remote head set with the local head set
5. run conflict checks and any local policy hooks
6. upload missing local heads only after remote apply and conflict/policy evaluation
7. start `CHANGES` with `mode = "tail"`, `since = S`, and `live = true`
8. continue from the relay tail

This gives the protocols clear responsibilities:

- `CHANGES` in bootstrap mode answers "what are the current heads at snapshot `S`?"
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
- store the revision if new
- update the local revision graph for `(pubkey, d)`
- recalculate the local head set for that document
- treat multiple heads as a real conflict until application logic resolves them

The changes feed does not define any built-in winner among conflicting heads.

Recommended client behavior for unresolved multi-head state:

- make the document read-only
- require explicit user resolution before further editing continues on that document

## Relay Expectations

To support bootstrap and the changes feed well, the relay should:

- assign a sequence number to each accepted sync event
- classify sync events by kind range
- index the sync metadata tags used for filtering
- retain enough revision metadata to preserve graph semantics
- maintain one changes cursor namespace per relay instance
- materialize the current head set
- evaluate bootstrap against a stable snapshot

Recommended first-class filter surface:

- `authors`
- `kinds`
- `#d`
- `#r`
- `#b`
- `#o`
- optional `#c`

## Retention And Compaction

This model supports payload compaction and replay retention limits, but this draft does not fully define them.

Important compatibility point:

- relay-local `seq` replay is only meaningful inside the relay's retained history window

Recommended future advertisement fields include:

- a minimum retained `seq`
- any payload-retention boundary if non-head payloads may be compacted

If a client has fallen behind the retained replay window, the client should fall back to bootstrap rather than assume the feed alone can restore full state.

Current-head bootstrap is intentionally more compaction-friendly than full-history repair.

## Open Questions

- Should the feed later expose metadata-only replay modes in addition to full events?
- How should relays advertise replay and payload retention boundaries?

## Future Work

- Define replay retention advertisement
- Define compaction signaling for historical fetches
- Define concrete application profiles on top of sync-range events
