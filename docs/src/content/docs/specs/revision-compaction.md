---
title: Sync Retention And Compaction
description: Draft retention and compaction rules for sync-range events and their payloads.
sidebar:
  label: Compaction
  order: 4
---

`draft`

Related drafts:

- [Revision Sync Range](/specs/revision-sync-range/)
- [Sync Changes Feed](/specs/revision-changes-feed/)

## Summary

This draft defines retention and compaction concepts for sync-range events.

The goal is to let relays reduce storage usage without breaking the meaning of current sync state.

This draft separates:

- revision metadata retention
- payload body retention
- replay retention

Those are related, but they are not the same thing.

## Goals

- Support storage reduction without breaking sync correctness
- Preserve current-state semantics under compaction
- Let relays advertise retention boundaries clearly
- Let clients distinguish unknown data from compacted data

## Non-Goals

- Defining the live changes feed itself
- Defining anti-entropy itself
- Requiring all relays to keep all historical payload bodies
- Defining application-specific payload semantics

## Three Retention Layers

### Revision metadata retention

Revision metadata means the data required to preserve graph semantics, including:

- author pubkey
- kind
- `d`
- `r`
- `b`
- `o`
- optional `c`
- `created_at`

If revision metadata is retained, the relay can still:

- identify the revision
- place it in the revision graph
- calculate head sets
- detect conflicts

### Payload body retention

Payload body retention means the relay still has the full event body needed to serve the original sync event for historical fetch.

For encrypted or application-specific sync events, this is the part that may be large and expensive to retain forever.

### Replay retention

Replay retention means the relay can still serve ordered replay by `seq` from some historical point.

This is independent from whether old payload bodies still exist.

## Safe Compaction Principle

A relay may compact payload bodies more aggressively than revision metadata, as long as it preserves enough metadata to keep the revision graph and current head set correct.

That means:

- payload bodies may be compacted
- revision metadata should generally outlive payload bodies
- current heads should remain fetchable unless the relay explicitly advertises otherwise

For a relay that claims to support sync-range bootstrap and replay, current heads should remain fetchable.

## Required Compatibility Properties

Compaction must not:

- make a current head disappear silently
- collapse two distinct revisions into one
- remove parent edges required to explain surviving heads
- make a known revision indistinguishable from an unknown revision

## Recommended Minimum Preservation

When compacting a non-head revision, a relay should preserve at least:

- author pubkey
- kind
- `d`
- `r`
- `b`
- `o`
- optional `c`
- `created_at`
- relay-local acceptance sequence or enough retained replay metadata to preserve the feed contract

## Current Heads

Required rule for sync relays:

- current heads must remain fetchable

Reason:

- a current head is part of current logical state
- bootstrap and replay are simplest when current heads remain fetchable
- compacting current heads forces clients into application-specific recovery logic too early

This is the simplest invariant for current-head bootstrap:

- current state is always fetchable
- only non-head payloads may be compacted

## Replay Retention

Replay retention is a separate policy from payload retention.

A relay may choose to:

- keep only a moving replay window by `seq`
- keep longer-lived revision metadata outside that replay window

If a client falls behind the replay retention window, the client should not expect the changes feed alone to restore state.

Replay retention and payload retention should vary independently.

That means a relay may choose all of the following at once:

- a bounded replay window by `seq`
- indefinite fetchability of current heads
- earlier compaction of old non-head payloads
- longer retention of revision metadata than payload bodies

## Relay Advertisement

Relays should advertise retention boundaries explicitly.

Recommended advertisement fields:

- `min_seq`: minimum replayable sequence
- `heads_fetchable`: boolean
- `payload_retention`: object describing payload-body retention policy

Recommended shape:

```json
{
  "min_seq": 125000,
  "heads_fetchable": true,
  "payload_retention": {
    "mode": "non_head_compaction",
    "min_created_at": 1730000000
  }
}
```

Field meanings:

- `min_seq`: earliest replayable sequence in the changes feed
- `heads_fetchable`: whether current heads are guaranteed fetchable
- `payload_retention.mode`: current payload compaction policy
- `payload_retention.min_created_at`: earliest event timestamp for which compactable payload bodies are still generally expected to be fetchable

## Historical Fetch Behavior

If a client requests a revision whose metadata is known but whose payload body has been compacted, the relay should return an explicit compacted state rather than behaving as if the revision never existed.

Recommended response shape:

```json
[
  "EVENT-STATUS",
  "<subscription-id>",
  { "r": "<revision-id>", "status": "compacted" }
]
```

Clients need to distinguish:

- unknown revision
- known revision with fetchable payload
- known revision with compacted payload

## Interaction With The Changes Feed

The changes feed remains valid under compaction as long as:

- replay semantics are honored inside the retained replay window
- current heads and required graph metadata remain coherent

The feed does not require every historical payload body to remain fetchable forever.

## Interaction With Bootstrap And Repair

Bootstrap and repair become more sensitive to compaction than the live feed.

For that reason:

- current-head bootstrap is safer under compaction than full-history bootstrap
- relays should make compaction state visible before clients attempt deep historical repair

## Open Questions

- Should the protocol define separate retention classes for metadata, payloads, and replay?
- Should relays advertise a payload retention boundary using `created_at`, `seq`, both, or neither?
- Should the compacted response include additional metadata beyond `r` and `status`?

## Future Work

- Define any stricter minimal retention guarantees for sync relays
