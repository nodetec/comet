---
title: Revision Changes Feed
description: Draft Comet changes feed for live and incremental sync over immutable revision gift wraps.
sidebar:
  label: Revision Feed
  order: 3
---

`draft`

Related drafts:

- [Revision Gift Wrap](/specs/revision-gift-wrap/)
- [Revision Negentropy](/specs/revision-negentropy/)

## Summary

Comet should keep a sequence-based changes feed for live and incremental sync, but adapt it to the revision gift-wrap model.

In this model:

- sync payloads are immutable revisions
- logical deletion is a tombstone revision
- the relay sequence remains relay-specific

This feed remains the primary protocol for the live tail. Negentropy is only for bootstrap and repair.

Relays implementing this feed should also advertise the revision-sync extension at the relay root so clients can discover the supported strategy before beginning bootstrap.

## Goals

- Ordered incremental sync
- Live updates after catch-up
- Relay-specific checkpoints
- Compatibility with immutable revision gift wraps
- Clear handling of logical deletes via tombstones

## Non-Goals

- Replacing Negentropy for initial sync
- Defining a hard requirement for relay-side history retention forever
- Making clients reason about raw relay storage details

## Stored Object Model

The feed assumes the relay stores immutable revision gift wraps, each carrying:

- `p`
- `d`
- `r`
- zero or more `prev`
- `op`
- `m`
- `type`

The relay sequence orders accepted mutations to that revision set.

## Core Principle

The changes feed should stream **stored revision events**.

For Comet logical sync:

- document creation or update is a normal stored revision with `op=put`
- document deletion is a normal stored revision with `op=del`

That means clients should not depend on `DELETED` messages for normal note deletion.

Logical deletion is represented by a tombstone revision in the event stream.

## Protocol Shape

This draft keeps the same high-level message family as the existing `CHANGES` draft:

```json
["CHANGES", <subscription_id>, <filter>]
```

The filter should support the same core fields:

- `since`
- `until_seq`
- `limit`
- `kinds`
- `authors`
- `#<tag>`
- `live`

For Comet revision sync, the most important filters are:

- `kinds: [1059]`
- `#p`
- `#d`
- `#r`

## Streamed Entries

Recommended primary message:

```json
["CHANGES", <subscription_id>, "EVENT", <seq>, <event>]
```

Where:

- `seq` is the relay-specific sequence number
- `event` is the full gift-wrapped revision event

The client can decrypt the event, read the outer revision tags, and apply the revision graph locally.

## `DELETED` Semantics

The feed may still support:

```json
["CHANGES", <subscription_id>, "DELETED", <seq>, <event_id>, <reason>]
```

But in the revision model, `DELETED` is not the normal mechanism for note deletion.

Recommended meaning:

- `DELETED` is reserved for hard relay-side removal, retention cleanup, or administrative deletion
- logical note deletion should flow through a tombstone revision event with `op=del`

Clients maintaining note state should treat tombstone revisions as authoritative.

## `EOSE` And Checkpoints

After replaying the requested range, the relay should send:

```json
["CHANGES", <subscription_id>, "EOSE", <last_seq>]
```

Clients should persist `last_seq` as the relay-specific checkpoint.

The checkpoint remains the source of truth for ongoing incremental sync on that relay.

Clients must maintain a separate checkpoint per relay. `seq` values from different relays are never comparable.

## Client Apply Rules

When a client receives a revision event:

- decrypt it
- read `d`, `rev`, `prev`, `op`, and `mtime`
- store the revision if new
- update the local head set for the document
- if the document has one head, use that as the current state
- if the document has multiple heads, mark it conflicted

This is what lets Comet move beyond timestamp-only LWW while still keeping a simple live feed.

## Why `CHANGES` Still Matters

Negentropy is not a substitute for a live ordered tail.

Comet still needs `CHANGES` because it provides:

- a relay-local total order
- efficient reconnect after temporary disconnect
- a stable incremental checkpoint
- immediate live updates

That is true even if Comet later adopts revision-aware Negentropy for bootstrap.

## Relay Requirements

To support the revision feed well, the relay should:

- assign a sequence number to each accepted revision event
- index the revision tags used by sync
- avoid deleting old revisions merely because a newer head exists
- materialize current heads on write
- optionally emit hard-delete notifications separately from logical tombstones

## Retention And Compacted Payloads

This feed assumes the relay may compact old payload bodies independently from revision metadata.

Recommended advertisement:

- `min_seq` for `CHANGES` retention
- a payload-retention boundary such as `min_payload_mtime`

Semantics:

- payloads newer than the advertised payload-retention boundary should still be fetchable
- payloads older than that boundary may or may not still exist

If a client requests a known revision whose payload body has been compacted, the relay should surface that state explicitly. It should not fail in a way that is indistinguishable from "revision never existed."

Recommended fetch response:

```json
[
  "EVENT-STATUS",
  "<subscription_id>",
  { "rev": "<rev>", "status": "payload_compacted" }
]
```

## Relationship To Bootstrap

The bootstrap handoff boundary is defined by the revision Negentropy draft.

This feed assumes the client enters live mode by starting `CHANGES` at the relay snapshot sequence returned by the Negentropy session.

## Open Questions

- Whether the feed should eventually add a head-only query mode
- Whether clients should be able to ask for envelope metadata without full encrypted payloads
- How relay compaction should interact with old revisions and historical replay

## Final Recommendation

Comet should keep a sequence-based `CHANGES` feed, but interpret it as a stream of immutable revision gift-wrap events rather than replaceable document slots.

That keeps live sync simple while aligning the relay tail with the revision and anti-entropy model.
