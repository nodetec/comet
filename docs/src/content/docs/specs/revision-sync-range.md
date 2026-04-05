---
title: Revision Sync Range
description: Draft NIP reserving a dedicated event kind range for revision-oriented sync events and defining sync metadata.
sidebar:
  label: Sync Range
  order: 1
---

`draft`

## Summary

This draft reserves a dedicated event kind range for revision-oriented sync events and defines relay-visible sync metadata shared by that range.

This document does not define any application-specific inner payload format. It only defines:

- protocol identification by event kind
- sync metadata tags
- document identity and revision ancestry rules
- relay validation and indexing expectations

## Goals

- Let relays identify sync protocol events by kind alone
- Give revision sync a clean protocol namespace instead of overloading unrelated kinds
- Make document identity and revision ancestry explicit
- Support immutable revisions, tombstones, and merge revisions
- Keep sync metadata reusable across future sync kinds

## Non-Goals

- Defining any application-specific inner payload schema
- Defining bootstrap, anti-entropy, or live tail transport
- Defining conflict winner semantics
- Reusing generic gift-wrap kinds as the protocol identifier

## Why A Dedicated Range

Revision sync events should be recognizable as sync protocol events before inspecting arbitrary tag sets.

If sync reused a generic kind such as `kind:1059`, a relay would first need to parse and validate tags on every event of that kind to determine whether it was actually a sync event. That is a poor protocol boundary.

A dedicated kind range gives sync events:

- kind-based protocol identity
- a clean home for sync-specific validation rules
- a clean home for sync-specific metadata tags
- room for future sync event families without changing sync metadata again

This draft uses a dedicated range above the currently standardized event-class ranges so sync kinds do not inherit unrelated replaceable, ephemeral, or addressable semantics.

## Kind Range

This draft reserves:

```text
40000 <= kind < 50000
```

for revision-oriented sync events.

Rules:

- Any event in this range is a sync protocol event.
- Any event in this range must validate against the sync metadata defined below.
- Kinds in this range that are not explicitly defined remain reserved for future sync event families.

## Event Model

The event author pubkey defines the top-level sync namespace.

This means:

- full document identity is `(pubkey, d)`
- full revision identity is `(pubkey, d, r)`

For event-native sync events, the Nostr `created_at` field is the canonical revision timestamp. This draft does not define a separate outer logical time tag.

## Sync Metadata

Events in the sync range must include the following sync metadata tags.

### Required Tags

```text
["d", <document_coord>]
["r", <revision_id>]
["b", <parent_revision_id>]           // repeatable
["o", "put" | "del"]
```

### Optional Tags

```text
["c", <collection_name>]
```

## Tag Meanings

- `d`: logical document coordinate token
- `r`: stable revision coordinate token for this exact document state
- `b`: parent revision coordinate token; a merge revision may include more than one
- `o`: revision operation
- `c`: top-level collection classification such as `notes`, `notebooks`, or `files`

Important identity rules:

- `d` is not globally unique by itself
- `r` is not globally unique by itself
- `c` is not part of document identity or revision identity

## Validation Rules

A relay receiving an event in the sync range should validate at least the following:

- `d` must be present and non-empty
- `r` must be present and non-empty
- `o` must be present and equal to `put` or `del`
- each `b` tag, if present, must be non-empty

Additional sync rules:

- root revisions omit `b`
- merge revisions include more than one `b`
- every `b` value refers to a parent revision within the same `(pubkey, d)` document scope

If a sync-range event is missing required tags or contains malformed values, the relay should reject it as invalid sync protocol data.

## Revision Rules

### Immutable revisions

Each `(pubkey, d, r)` tuple represents one immutable logical revision.

The relay should not delete older revisions just because a newer revision for the same document arrives.

### Tombstones

Logical deletion is represented as a normal revision with:

```text
["o", "del"]
```

A tombstone is the current document head until a newer revision supersedes it.

### Merge revisions

A merge revision is any revision with more than one `b` tag.

This allows ancestry-aware merges without changing sync metadata.

## Head Semantics

The logical head set for a document is defined by the revision graph:

- a head is any stored revision not referenced by another stored revision for the same `(pubkey, d)`
- one head means the document has a single current state
- multiple heads mean a true conflict branch

The protocol does not define a built-in winner among multiple heads.

That is intentional:

- the revision graph is protocol truth
- conflict resolution policy is application behavior

## Relay Expectations

To support revision sync, the relay should:

- classify sync events by kind range before inspecting application payloads
- retain immutable revisions keyed by `(pubkey, d, r)`
- store parent edges from repeatable `b` tags
- materialize the current head set
- allow filtering by the sync metadata tags

Recommended first-class query surface:

- author pubkey namespace
- `#d`
- `#r`
- `#b`
- `#o`
- optional `#c`

## Client Expectations

The client should treat:

- `d` as the document coordinate token
- `r` as the revision coordinate token
- `b` as parent revision ids
- `o=del` as a logical deletion marker
- `created_at` as the canonical revision timestamp for event-native sync events

The client should not assume that one conflicting head is automatically canonical.

## Relationship To Revision Databases

This model is revision-tree shaped, but it does not rely on a database-specific replication system.

In particular:

- revision identity and parent edges are explicit protocol data
- head selection is derived from the graph
- winner selection is left to applications rather than built into the protocol

## Future Work

- Define concrete kinds inside the reserved sync range
- Define application-specific inner payload profiles on those concrete kinds
- Define bootstrap and anti-entropy for sync-range events
- Define live relay tail behavior for sync-range events
- Define additional kinds inside the sync range if future sync event families need them
