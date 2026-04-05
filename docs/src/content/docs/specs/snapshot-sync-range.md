---
title: Sync Event Range
description: Draft NIP reserving a dedicated event kind range for local-first sync events and defining minimal sync metadata.
sidebar:
  label: Sync Range
  order: 1
---

`draft`

## Summary

This draft reserves a dedicated event kind range for local-first sync events and defines the relay-visible sync metadata shared by that range.

This document does not define any application-specific inner payload format. It only defines:

- protocol identification by event kind
- sync metadata tags
- document identity rules
- relay validation and indexing expectations

## Goals

- Let relays identify sync protocol events by kind alone
- Give snapshot sync a clean protocol namespace instead of overloading unrelated kinds
- Make document identity explicit
- Support local-first current-state sync, tombstones, and bounded history
- Keep sync metadata reusable across future sync kinds

## Non-Goals

- Defining any application-specific inner payload schema
- Defining application-specific conflict-resolution policy
- Defining bootstrap, replay, or live tail transport
- Defining conflict winner semantics
- Reusing generic gift-wrap kinds as the protocol identifier

## Why A Dedicated Range

Sync events should be recognizable as sync protocol events before inspecting arbitrary tag sets.

If sync reused a generic kind such as `kind:1059`, a relay would first need to parse and validate tags on every event of that kind to determine whether it was actually a sync event. That is a poor protocol boundary for a local-first sync extension.

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

for sync events.

Rules:

- Any event in this range is a sync protocol event.
- Any event in this range must validate against the sync metadata defined below.
- Kinds in this range that are not explicitly defined remain reserved for future sync event families.

## Event Model

The event author pubkey defines the top-level sync namespace.

This means:

- full document identity is `(pubkey, d)`

This draft does not define one universal current-state ordering scheme in relay-visible tags.

Profiles in this range may determine supersedence and conflict using:

- relay-visible metadata that duplicates enough causal state for relay-side retention and bootstrap
- and any additional profile-defined decrypted state needed by clients during local apply

The Nostr `created_at` field remains the event timestamp, but profiles are free to define richer local-first ordering or conflict metadata inside encrypted payloads.

## Sync Metadata

Events in the sync range must include the following sync metadata tags.

### Required Tags

```text
["d", <document_coord>]
["o", "put" | "del"]
```

### Optional Tags

```text
["c", <collection_name>]
```

## Tag Meanings

- `d`: logical document coordinate token
- `o`: snapshot operation
- `c`: top-level collection classification such as `notes`, `notebooks`, or `files`

Important identity rules:

- `d` is not globally unique by itself
- `c` is not part of document identity or snapshot identity

## Validation Rules

A relay receiving an event in the sync range should validate at least the following:

- `d` must be present and non-empty
- `o` must be present and equal to `put` or `del`

If a sync-range event is missing required tags or contains malformed values, the relay should reject it as invalid sync protocol data.

## Snapshot Rules

### Snapshot events

Each sync event in this range represents one immutable sync snapshot.

Profiles may use encrypted payload metadata, such as vector clocks, to determine whether a newer snapshot supersedes an older one.

### Tombstones

Logical deletion is represented as a normal sync event with:

```text
["o", "del"]
```

Profiles may define how deletion snapshots participate in supersedence and conflict resolution.

## Conflict Semantics

This draft does not define a built-in winner among multiple snapshots for the same `(pubkey, d)`.

That is intentional:

- sync metadata defines document scope and operation
- application profiles define encrypted payload semantics
- conflict detection and resolution policy belong to the profile or application layer

## Relay Expectations

To support snapshot sync, the relay should:

- classify sync events by kind range before inspecting application payloads
- retain fetchable sync events for the configured retention window
- maintain relay-local replay order
- allow filtering by the sync metadata tags

Recommended first-class query surface:

- author pubkey namespace
- `#d`
- `#o`
- optional `#c`

This draft does not require the relay to derive current state or conflict winners from encrypted payloads.

Profiles may choose either:

- dumb-relay operation, where the relay stores and replays encrypted snapshots and clients compare payload metadata locally
- smarter relay operation, where a profile exposes enough cleartext metadata for relay-side retention and bootstrap decisions

## Client Expectations

The client should treat:

- `d` as the document coordinate token
- `o=del` as a logical deletion marker
- encrypted payload metadata as the profile-defined source of supersedence and conflict detection

The client should not assume that one conflicting snapshot is automatically canonical.

## Relationship To Local-First Applications

This model is designed to support local-first applications where:

- the canonical local object may remain a normal document record
- sync transmits encrypted snapshots of that record
- bounded recent history is acceptable
- full snapshot ancestry is not required forever

## Future Work

- Define concrete kinds inside the reserved sync range
- Define application-specific payload profiles on those concrete kinds
- Define bootstrap, replay, and live-follow behavior for sync-range events
- Define conflict and supersedence metadata for concrete profiles
- Define additional kinds inside the sync range if future sync event families need them
