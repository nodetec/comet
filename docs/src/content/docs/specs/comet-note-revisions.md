---
title: Comet Note Revisions
description: Draft Comet profile defining the first concrete sync kind inside the reserved sync range.
sidebar:
  label: Comet Notes
  order: 2
---

`draft`

Related drafts:

- [Revision Sync Range](/specs/revision-sync-range/)
- [Sync Changes Feed](/specs/revision-changes-feed/)
- [Sync Retention And Compaction](/specs/revision-compaction/)

## Summary

This draft defines the first concrete Comet sync kind inside the reserved sync range:

```text
kind:42061
```

This kind is for Comet note revision events.

This draft also commits Comet to event-native local storage:

- Comet note revisions should be stored locally as canonical events
- local note state should be derived from those events and their revision graph
- Comet should stop treating sync events as a projection of a separate app-native note record

## Goals

- Define Comet's first concrete sync kind
- Align local storage with the sync protocol's event-native model
- Keep Comet-specific payload semantics separate from the generic sync-range draft

## Non-Goals

- Defining other future Comet sync kinds
- Defining notebook or file payloads in this draft
- Freezing the complete inner payload shape before implementation work

## Kind Allocation

Comet note revisions use:

```text
kind:42061
```

This kind is inside the reserved sync range:

```text
40000 <= kind < 50000
```

## Event-Native Local Storage

Comet should commit to event-native local storage for note revisions.

That means:

- the canonical local object is the revision event
- `created_at` is the canonical revision timestamp
- document identity is derived from `(pubkey, d)`
- revision identity is derived from `(pubkey, d, r)`
- conflict state is derived from the revision graph, not from a separate mutable row model

This direction removes the need to invent a separate local logical time field for note revisions and keeps protocol identity aligned with local persistence.

## Sync Metadata

`kind:42061` uses the sync metadata defined by the generic sync-range draft:

- required: `d`, `r`, `b`, `o`
- optional: `c`

For Comet note revisions:

- `d` should be a randomly generated UUIDv4
- `d` should be serialized in canonical uppercase hyphenated form
- `c` should normally be `notes` when present

Example document coordinate:

```text
B181093E-A1A3-492F-BF55-6E661BFEA397
```

## Inner Payload

The `kind:42061` payload should be an encrypted canonical JSON payload.

For Comet note revisions:

- all Comet note data should live inside the encrypted payload
- the outer event should expose only sync metadata
- note-specific tags and attachment metadata should not be exposed as cleartext event tags
- local canonical note state should remain plaintext on disk

The intended boundary is:

- outer tags: `d`, `r`, repeatable `b`, `o`, optional `c`
- encrypted content: all Comet note fields

## Encryption

For Comet implementation work, the `kind:42061` payload should be encrypted using Comet's current large-payload-capable NIP-44 variant.

This is a Comet implementation choice, not a generic sync-range requirement.

If a standardized large-payload NIP-44 construction is adopted later, Comet should move to that standardized construction.

Wire payload encryption does not require local payload encryption.

Comet should keep canonical note text and canonical payload data unencrypted locally unless a separate local-at-rest encryption feature is introduced.

## Canonical Payload Shape

The canonical payload for `kind:42061` should be a JSON object with this shape:

```json
{
  "version": 1,
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
- `markdown` is the canonical note body
- `note_created_at` is the document-level creation timestamp
- `edited_at` is the last content-edit timestamp
- `archived_at` is present when the note is archived
- `pinned_at` is present when the note is pinned
- `readonly` represents user-intent readonly state
- `tags` contains Comet note tags
- `attachments` contains attachment references and decryption material

## Canonical JSON Rules

Before encryption, the payload should be serialized as canonical JSON.

Comet should use these rules:

- serialize the payload as UTF-8 JSON
- apply RFC 8785 JSON Canonicalization Scheme semantics to object serialization
- `version`, `markdown`, `note_created_at`, `edited_at`, `tags`, and `attachments` are always present
- `archived_at` and `pinned_at` are omitted when absent
- `readonly` is omitted when false and included only when true
- `tags` must be canonicalized, deduplicated, and sorted lexicographically
- `attachments` must be deduplicated by `plaintext_hash` and sorted lexicographically by `plaintext_hash`
- `note_created_at`, `edited_at`, `archived_at`, and `pinned_at` are millisecond Unix timestamps
- `markdown` is preserved exactly as authored and is not normalized beyond normal JSON string escaping

These rules exist to make the encrypted payload deterministic before encryption and signing.

## Title Semantics

Markdown is authoritative.

Comet note revisions should not store title as separate canonical state in either sync metadata or the encrypted payload.

Instead, clients should derive title locally from markdown using this rule:

- scan markdown line by line
- ignore empty lines
- use the first non-empty H1 line beginning with `# `
- trim the heading text
- if no non-empty H1 exists, the derived title is the empty string

This means:

- changing the first H1 changes the derived title
- notes without an H1 have no canonical title
- title is a local projection, not part of revision identity or payload truth

## Fields Not In The Payload

The canonical encrypted payload should not include:

- `modified_at`
  because event `created_at` is the canonical revision timestamp
- `deleted_at`
  because deletion is represented by sync metadata `o=del`
- `title`
  because title should be derived locally from markdown
- `type`
  because `kind:42061` already identifies the payload as a Comet note revision

## Current Direction

The intended direction is:

- one canonical event per note revision
- immutable revision events
- encrypted JSON payloads
- note state derived from the head set of those revision events
- user-visible conflict resolution when multiple heads exist

## Open Questions

- Which encryption construction should `kind:42061` use for its payload?
- What exact canonical JSON serialization rules should Comet enforce?
- Should `archived_at`, `pinned_at`, and `readonly` remain in the first payload version exactly as defined here?

## Future Work

- Implement local event-native persistence for note revisions
- Define any additional Comet sync kinds if notebooks or files need distinct profiles

## Implementation Assumption

Comet should treat this transition as a clean break.

Implementation may replace the current mutable note-and-sync storage model rather than preserving compatibility with the older projection-based schema.
