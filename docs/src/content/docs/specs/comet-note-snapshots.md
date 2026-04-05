---
title: Comet Note Snapshots
description: Draft Comet profile defining the first concrete sync kind as an encrypted full-note snapshot with vector clocks.
sidebar:
  label: Comet Notes
  order: 2
---

`draft`

Related drafts:

- [Causal Snapshot Sync Range](/specs/causal-snapshot-sync-range/)
- [Snapshot Changes Feed](/specs/snapshot-changes-feed/)
- [Snapshot Retention And Compaction](/specs/snapshot-compaction/)

## Summary

This draft defines the first concrete Comet sync kind inside the reserved sync range:

```text
kind:42061
```

This kind is for Comet note snapshot events.

This draft also defines Comet as a local-first note system:

- the canonical local object is the note record
- sync transmits encrypted full-note snapshots
- vector clocks determine whether snapshots are newer, older, or concurrent
- relay-visible `vc` tags carry the wire vector-clock state so relays can retain and bootstrap current snapshots more intelligently
- bounded recent history is a product feature, not the permanent sync substrate
- retained local snapshots now back an explicit local note-history feature

## Goals

- Define Comet's first concrete sync kind
- Align the sync protocol with a local-first note model
- Support multi-device offline edits without silent overwrites
- Let Comet keep bounded recent history rather than unbounded snapshot ancestry
- Keep Comet-specific payload semantics separate from the generic sync-range draft

## Non-Goals

- Defining other future Comet sync kinds
- Defining notebook or file payloads in this draft
- Requiring relays to inspect encrypted payloads to determine current state

## Kind Allocation

Comet note snapshots use:

```text
kind:42061
```

This kind is inside the reserved sync range:

```text
40000 <= kind < 50000
```

## Local Canonical State

Comet should keep the local note record as the canonical object.

That means:

- the canonical local object is the note row
- `d` is the stable document identifier for that note
- note content remains plaintext locally
- vector-clock state is attached to the local note
- sync events are emitted from local note state rather than treated as the only source of truth

The intended local canonical fields are:

- `d`
- `markdown`
- `note_created_at`
- `edited_at`
- `archived_at`
- `pinned_at`
- `readonly`
- `vector_clock`
- `last_edit_device_id`

Current note state is authoritative locally.

Encrypted sync events are the transport used to move that state across devices and relays.

## Current Comet Defaults

Current implementation defaults:

- local keeps the canonical note row as current state
- local keeps all unresolved conflict snapshots
- local keeps the current tombstone while a note remains deleted
- local keeps the last `10` additional dominated snapshots per note
- relay keeps all nondominated current snapshots plus enough dominated snapshots to reach a total retained payload window of `4` snapshots per document when possible
- local note history is derived from the retained local snapshot set

## Sync Metadata

`kind:42061` uses the sync metadata defined by the causal snapshot sync range draft:

- required: `d`, `o`, repeatable `vc`
- optional: `c`

For Comet note snapshots:

- `d` should be a randomly generated UUIDv4
- `d` should be serialized in canonical uppercase hyphenated form
- `c` should normally be `notes` when present
- `vc` should be emitted once per vector-clock entry as `["vc", "<device_id>", "<counter>"]`

Example document coordinate:

```text
B181093E-A1A3-492F-BF55-6E661BFEA397
```

## Device Identity

Each Comet device should have a stable `device_id`.

The `device_id` is used only for sync ordering and conflict detection.

It is not a document identifier.

For Comet, `device_id` should be an opaque randomly generated stable identifier, not a human-readable device label.

## Vector Clock Model

Each note carries a vector clock.

Example:

```json
{
  "MBP-4f2c": 12,
  "IPHONE-a91d": 3
}
```

Clock update rule:

- when a device edits a note, it increments its own counter in that note's vector clock
- then it emits a new encrypted snapshot event

Clock comparison rules:

- if local clock dominates remote clock, remote is stale
- if remote clock dominates local clock, remote should replace local
- if neither dominates, the snapshots are concurrent and the note is conflicted

This means Comet no longer needs a permanent explicit ancestry graph to decide whether one note state supersedes another.

For relay-facing metadata, the vector clock is carried in cleartext `vc` tags.

That allows a relay to:

- retain all nondominated current snapshots
- compact dominated snapshots more safely
- bootstrap current snapshots rather than a blind recent window

Clients should treat the `vc` tags as the wire source of truth for vector-clock state and hydrate local in-memory snapshot objects from those tags after decryption.

## Encryption

For Comet implementation work, the `kind:42061` payload should be encrypted using Comet's current large-payload-capable NIP-44 variant.

This is a Comet implementation choice layered on top of the causal snapshot sync range.

If a standardized large-payload NIP-44 construction is adopted later, Comet should move to that standardized construction.

Wire payload encryption does not require local payload encryption.

Comet should keep canonical note text and canonical payload data unencrypted locally unless a separate local-at-rest encryption feature is introduced.

## Canonical Payload Shape

The canonical payload for `kind:42061` should be a JSON object with this shape:

```json
{
  "version": 1,
  "device_id": "MBP-4f2c",
  "markdown": "# Title\n\nBody",
  "note_created_at": 1712345678000,
  "edited_at": 1712345678000,
  "archived_at": null,
  "pinned_at": null,
  "readonly": false,
  "tags": ["work/project-alpha", "roadmap"],
  "attachments": [
    {
      "plaintext_hash": "sha256-...",
      "ciphertext_hash": "sha256-...",
      "key": "hex..."
    }
  ]
}
```

Field guidance:

- `version` versions the Comet note payload format
- `device_id` identifies the device that produced this snapshot
- `markdown` is the canonical note body
- `note_created_at` is the document-level creation timestamp
- `edited_at` is the last content-edit timestamp
- `archived_at` is present when the note is archived
- `pinned_at` is present when the note is pinned
- `readonly` represents user-intent readonly state
- `tags` contains Comet note tags
- `attachments` contains attachment references and decryption material

For tombstones:

- outer `o` is `del`
- the event must still include at least one `vc` tag as required by the causal snapshot sync range
- the payload must include `version`, `device_id`, and `deleted_at`
- note body fields may be omitted or represented minimally
- the current tombstone should remain durable while the note stays deleted

## Canonical JSON Rules

Before encryption, the payload should be serialized as canonical JSON.

Comet should use these rules:

- serialize the payload as UTF-8 JSON
- apply RFC 8785 JSON Canonicalization Scheme semantics to object serialization
- `version`, `device_id`, `tags`, and `attachments` are always present
- `markdown`, `note_created_at`, and `edited_at` are always present for `o=put`
- `deleted_at` is always present for `o=del`
- `archived_at` and `pinned_at` are omitted when absent
- `readonly` is omitted when false and included only when true
- `tags` must be canonicalized, deduplicated, and sorted lexicographically
- `attachments` must be deduplicated by `plaintext_hash` and sorted lexicographically by `plaintext_hash`
- `note_created_at`, `edited_at`, `archived_at`, and `pinned_at` are millisecond Unix timestamps
- `markdown` is preserved exactly as authored and is not normalized beyond normal JSON string escaping

These rules exist to make the snapshot payload deterministic before encryption and signing.

## Title Semantics

Markdown is authoritative.

Comet note snapshots should not store title as separate canonical state in either sync metadata or the encrypted payload.

Instead, clients should derive title locally from markdown using this rule:

- scan markdown line by line
- ignore empty lines
- use the first non-empty H1 line beginning with `# `
- trim the heading text
- if no non-empty H1 exists, the derived title is the empty string

This means:

- changing the first H1 changes the derived title
- notes without an H1 have no canonical title
- title is a local projection, not part of canonical sync state

## Fields Not In The Payload

The canonical encrypted payload should not include:

- `deleted_at`
  because deletion is represented by sync metadata `o=del`
- `vector_clock`
  because vector-clock state is carried in cleartext `vc` tags
- `title`
  because title should be derived locally from markdown
- `type`
  because `kind:42061` already identifies the payload as a Comet note snapshot

## Conflict Resolution

When two note snapshots are concurrent:

- Comet should mark the note conflicted and read-only
- Comet should surface both note states to the user
- user resolution should produce a new merged snapshot
- the merged snapshot's vector clock should be:
  - the pointwise max of both clocks
  - then incremented for the resolving device

Example:

- left: `{ "A": 5, "B": 2 }`
- right: `{ "A": 4, "B": 3 }`
- merge on device `A` => `{ "A": 6, "B": 3 }`

The merged snapshot then dominates both prior snapshots.

## Local History

Comet should treat retained local snapshots as a user-facing history feature, not only as internal sync state.

That means:

- retained local snapshots may be listed in the UI as note history
- a user may inspect an older retained snapshot without changing current state
- restoring an older retained snapshot should produce a new current note state
- restoring history does not rewrite history in place; it produces a newer snapshot from the restored content

## Retention Direction

The intended retention direction is:

- keep the canonical local note record
- keep current snapshots needed for sync correctness
- keep a bounded recent snapshot history per note
- keep all unresolved concurrent snapshots until resolved
- allow older dominated snapshots to be dropped locally and on relays

Current Comet defaults:

- local keeps current materialized state
- local keeps all unresolved conflict snapshots
- local keeps the current tombstone for deleted notes
- local keeps the last `10` additional dominated snapshots per note
- relay keeps all nondominated current snapshots plus enough dominated snapshots to reach a total retained payload window of `4` snapshots per document when possible

This gives Comet:

- explicit conflict handling
- bounded storage
- local-first semantics
- sync that does not require unbounded ancestry metadata

## Relay Expectations

The first Comet profile should work with a relay that remains blind to note content but can inspect relay-visible vector-clock metadata.

That means:

- the relay stores and replays encrypted note snapshots
- the relay does not need to decrypt payloads
- the relay may compare cleartext `vc` tags to determine nondominated current snapshots
- the client remains the final authority for local materialization after decrypting the profile payload and applying the relay-visible `vc` clock

This keeps the relay blind to note content while still allowing better retention and bootstrap decisions.

## Current Direction

The intended direction is:

- canonical local note record
- encrypted snapshot transport
- vector-clock supersedence
- bounded recent history
- explicit user-visible conflict resolution

## Future Work

- Implement vector-clock note sync locally
- Define any additional Comet sync kinds if notebooks or files need distinct profiles

## Implementation Assumption

Comet should treat this transition as a clean break.

Implementation may replace the older graph-shaped sync storage model rather than preserving compatibility with older transition layers.

## Implementation Plan

Recommended implementation order:

1. keep the local `notes` table canonical and add `device_id` plus `vector_clock`
2. make `kind:42061` emit encrypted full-note snapshots from local note state
3. compare vector clocks locally during bootstrap and replay
4. retain current snapshots plus a bounded recent-history window
5. keep unresolved concurrent snapshots until the user resolves them
6. move any remaining graph-specific code and schema out of the sync path
