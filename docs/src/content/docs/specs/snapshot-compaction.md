---
title: Snapshot Retention And Compaction
description: Draft retention and compaction rules for snapshot-oriented sync events and their payloads.
sidebar:
  label: Compaction
  order: 4
---

`draft`

Related drafts:

- [Snapshot Sync Range](/specs/snapshot-sync-range/)
- [Snapshot Changes Feed](/specs/snapshot-changes-feed/)
- [Comet Note Snapshots](/specs/comet-note-snapshots/)

## Summary

This draft defines retention and compaction concepts for sync-range events.

The goal is to let clients and relays reduce storage usage without breaking local-first sync correctness.

This draft separates:

- current snapshot retention
- bounded recent-history retention
- replay retention

Those are related, but they are not the same thing.

## Current Comet Defaults

Current implementation defaults:

- local keeps current materialized note state
- local keeps all unresolved conflict snapshots
- local keeps the current tombstone for deleted notes
- local keeps the last `10` additional dominated snapshots per note
- relay keeps all nondominated current snapshots plus enough dominated snapshots to reach a total retained payload window of `4` snapshots per document when possible
- relay keeps replay independently from retained snapshot payloads
- local retained snapshots may be surfaced as bounded note history

## Goals

- Support storage reduction without breaking sync correctness
- Preserve current-state semantics under compaction
- Let relays advertise retention boundaries clearly
- Let clients distinguish unknown data from compacted data

## Non-Goals

- Defining the live changes feed itself
- Requiring all relays to keep all historical payload bodies
- Defining application-specific payload semantics

## Three Retention Layers

### Current snapshot retention

Current snapshot retention means the relay or client keeps the snapshots still needed for current sync and conflict handling.

For a note-sync profile such as Comet, that usually means:

- the latest known snapshot for a note
- any unresolved concurrent snapshots for that note
- the current tombstone while a note remains deleted

These are the snapshots required to represent current logical state.

### Recent-history retention

Recent-history retention means the relay or client keeps a bounded number of older dominated snapshots for recovery, audit, or UI history.

For a notes app, this should be bounded by policy, not indefinite.

### Replay retention

Replay retention means the relay can still serve ordered replay by `seq` from some historical point.

This is independent from whether older dominated snapshots still exist.

## Safe Compaction Principle

A relay may compact older dominated snapshots more aggressively than current snapshots, as long as it preserves enough retained data to let a client reconstruct current state and detect unresolved conflicts.

That means:

- retained current snapshots should remain fetchable
- unresolved concurrent snapshots should remain fetchable
- bounded recent-history snapshots may be kept or compacted according to policy
- replay retention may be shorter than snapshot retention

This is the simplest invariant for bootstrap:

- current state is always fetchable
- older dominated history is the first compaction target

When a profile exposes relay-visible causal metadata, such as Comet `vc` tags, the relay should use that metadata to decide which snapshots are nondominated before applying any bounded recent-history window.

## Required Compatibility Properties

Compaction must not:

- make a retained current snapshot disappear silently
- make two unresolved concurrent snapshots look like one
- make a retained snapshot indistinguishable from an unknown snapshot

## Recommended Minimum Preservation

When compacting older dominated snapshots, a relay should preserve at least:

- author pubkey
- kind
- `d`
- `o`
- optional `c`
- `created_at`
- any profile-defined retention metadata needed to tell current snapshots from older history
- relay-local acceptance sequence or enough retained replay metadata to preserve the feed contract

## Current Snapshots

Required rule for sync relays:

- retained current snapshots must remain fetchable

Reason:

- current snapshots are part of current logical state
- bootstrap and replay are simplest when current snapshots remain fetchable
- compacting current snapshots forces clients into application-specific recovery logic too early

This is the simplest invariant for snapshot bootstrap:

- current state is always fetchable
- older dominated history is the first compaction target

## Replay Retention

Replay retention is a separate policy from snapshot retention.

A relay may choose to:

- keep only a moving replay window by `seq`
- keep longer-lived retained current snapshots outside that replay window
- keep a bounded recent-history window for restore or UI history

If a client falls behind the replay retention window, the client should not expect the changes feed alone to restore state.

Replay retention and snapshot retention should vary independently.

That means a relay may choose all of the following at once:

- a bounded replay window by `seq`
- indefinite fetchability of retained current snapshots
- bounded recent-history retention
- shorter replay retention than retained snapshot retention

## Relay Advertisement

Relays should advertise retention boundaries explicitly.

Recommended advertisement fields:

- `min_seq`: minimum replayable sequence
- `current_snapshots_fetchable`: boolean
- `snapshot_retention`: object describing retained current and recent-history policy

Recommended shape:

```json
{
  "min_seq": 125000,
  "current_snapshots_fetchable": true,
  "snapshot_retention": {
    "mode": "nondominated_plus_recent_history",
    "recent_count": 4,
    "min_created_at": 1730000000
  }
}
```

Field meanings:

- `min_seq`: earliest replayable sequence in the changes feed
- `current_snapshots_fetchable`: whether current snapshots are guaranteed fetchable
- `snapshot_retention.mode`: current snapshot/history retention policy
- `snapshot_retention.recent_count`: bounded retained recent-history count when applicable
- `snapshot_retention.min_created_at`: earliest retained snapshot timestamp generally expected to remain fetchable

## Historical Fetch Behavior

If a client requests a snapshot that is known but no longer retained, the relay should return an explicit compacted state rather than behaving as if it never existed.

Recommended response shape:

```json
[
  "EVENT-STATUS",
  "<subscription-id>",
  { "id": "<snapshot-id>", "status": "payload_compacted" }
]
```

Clients need to distinguish:

- unknown snapshot
- retained fetchable snapshot
- known but compacted snapshot/history entry

## Interaction With The Changes Feed

The changes feed remains valid under compaction as long as:

- replay semantics are honored inside the retained replay window
- retained current snapshots and unresolved conflicts remain coherent

The feed does not require every older dominated snapshot to remain fetchable forever.

## Interaction With Bootstrap And Repair

Bootstrap and repair become more sensitive to compaction than the live feed.

For that reason:

- retained-snapshot bootstrap is safer under compaction than full-history repair
- relays should make compaction state visible before clients attempt deep historical restore

## Future Work

- Define any stricter minimal retention guarantees for sync relays
