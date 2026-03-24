---
title: Revision Gift Wrap
description: Draft Comet extension that adds stable logical revisions to encrypted gift-wrapped sync events.
sidebar:
  label: Revision Wrap
---

`draft`

Related drafts:

- [Revision Negentropy](/specs/revision-negentropy/)
- [Revision Changes Feed](/specs/revision-changes-feed/)

## Summary

Comet should keep encrypted `kind:1059` gift wraps for sync payload transport, but add a stable logical revision envelope in the outer tags.

The goal is to separate:

- payload privacy
- document identity
- revision identity

This lets Comet support multi-relay sync and revision-aware anti-entropy without making the outer gift wrap deterministic.

## Goals

- Preserve the privacy properties of gift wraps
- Give each logical note revision a stable identity across relays
- Support tombstones and merge revisions
- Support revision-aware Negentropy and revision-aware `CHANGES`

## Non-Goals

- Replacing NIP-59 with a new event kind
- Making ciphertext or outer event IDs stable across relays
- Exposing plaintext note content on the relay

## Problem

Today's outer gift-wrap event ID is not a good multi-relay identity because it changes on each publish.

That is expected because the wrap currently uses:

- a fresh ephemeral wrapping key
- a random NIP-44 nonce
- a tweaked timestamp

Those are good privacy properties. Comet should keep them.

The missing piece is a relay-visible logical revision identity that stays stable even when the outer event ID changes.

## Event Shape

Comet should continue to publish encrypted sync payloads as `kind:1059` gift wraps.

The outer tags should include:

```text
["p",     <recipient_pubkey>]
["d",     <doc_id>]
["r",     <32-byte-hex revision id>]
["prev",  <parent_revision_id>]        // repeatable
["op",    "put" | "del"]
["m",     <modified_at_ms_as_string>]
["type",  "note" | "notebook"]
["v",     "2"]
```

Field meanings:

- `p`: recipient pubkey for the gift wrap
- `d`: stable logical document ID within the recipient-specific namespace
- `r`: stable logical revision ID for this exact document state
- `prev`: parent revision ID; a merge revision may include more than one
- `op`: normal content revision or tombstone revision
- `m`: logical revision timestamp used for ordering hints
- `type`: logical sync entity type
- `v`: Comet sync schema version

For this extension, the outer `p` tag is not just transport metadata. It defines the recipient-specific namespace in which `d`, `rev`, heads, and anti-entropy scope are evaluated.

That means `d` is not globally unique by itself. Document identity is `(recipient, d)`, and revision identity is `(recipient, d, rev)`.

## Revision Identity

`rev` must not depend on the outer Nostr event ID.

Recommended rule:

```text
rev = HMAC(sync_secret, canonical_revision_payload)
```

The canonical revision payload should include:

- `d`
- sorted `prev` list
- `op`
- logical note or notebook fields
- attachment references
- schema version

Properties of this approach:

- stable across relays
- opaque to the relay
- changed by any meaningful document mutation
- usable as a 32-byte anti-entropy ID

## Revision Rules

### Immutable revisions

Each `(p, d, rev)` tuple represents one immutable logical revision.

The relay should not delete older revisions just because a newer revision for the same document arrives.

### Tombstones

Logical deletion should be represented as a normal revision with:

```text
["op", "del"]
```

A tombstone is the current document head until a newer revision supersedes it.

### Merge revisions

A merge revision is any revision with multiple `prev` tags.

That allows Comet to move from timestamp-only LWW toward ancestry-aware merges without changing the transport format again.

## Head Semantics

The outer gift wrap stores one immutable revision.

The logical head set for a document is defined by the revision graph:

- a head is any stored revision not referenced by another stored revision for the same `(p, d)`
- one head means the document has a single current state
- multiple heads mean a true conflict branch

For relay implementation, heads should be **materialized on write** and treated as a first-class read model. Rebuilding heads from the revision graph is a repair operation, not the normal read path.

## Relay Expectations

To support revision-aware sync, the relay should:

- retain immutable revisions keyed by `(recipient, d_tag, rev)`
- store parent edges for `prev`
- materialize the current head set
- allow filtering by the revision tags used in sync

Recommendation:

- keep the relay-queryable wire surface to single-letter tags such as `p`, `d`, `r`, and `m`
- map those tags onto descriptive internal schema fields like `recipient`, `d_tag`, `rev`, and `mtime`

Non-queryable metadata such as `prev`, `op`, and `type` can remain descriptive until there is a real need to expose them as indexed relay filters.

## Security Considerations

Do not try to make the outer gift wrap deterministic.

That would require removing or constraining the randomness in:

- the ephemeral wrapping key
- the encryption nonce
- the outer timestamp

Doing that would trade away privacy for transport identity. The better design is:

- stable logical identity in outer tags
- private payload in the encrypted body

## Client Expectations

The client should treat:

- `d` as the logical document coordinate
- `rev` as the logical version identity
- `prev` as ancestry
- `op=del` as a logical deletion marker

The client should not use the outer event ID as the durable logical identity for a revision.

## Open Questions

- Whether non-queryable metadata tags such as `prev`, `op`, and `type` should also move to single-letter aliases later
- Whether large merge histories should remain fully explicit in outer tags
- Whether future interop needs a second deterministic manifest event type in addition to the private gift wrap

## Final Recommendation

Comet should keep `kind:1059` gift wraps, but upgrade them from "private replaceable payloads" to "private immutable revision carriers" by adding stable outer revision tags.
