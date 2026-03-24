---
title: Revision Gift Wrap
description: Draft Comet extension that adds stable logical revisions to encrypted gift-wrapped sync events.
sidebar:
  label: Revision Wrap
  order: 1
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
["type",  "note" | "notebook"]         // optional, relay-visible hint
["v",     "2"]
```

Field meanings:

- `p`: recipient pubkey for the gift wrap
- `d`: stable logical document ID within the recipient-specific namespace
- `r`: stable logical revision ID for this exact document state
- `prev`: parent revision ID; a merge revision may include more than one
- `op`: normal content revision or tombstone revision
- `m`: logical revision timestamp used for ordering hints
- `type`: optional relay-visible logical sync entity type

For Comet itself, this outer `type` hint should normally be omitted for privacy. The authoritative entity type lives only inside the encrypted payload. Other apps may choose to publish an outer `type` if they want relay-visible classification.

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

## Blob Identity

Comet keeps attachment references and stored blob objects intentionally separate.

Within the encrypted note payload:

- markdown references attachments as `attachment://<plaintext_hash>.<ext>`
- `blob` tags carry `(plaintext_hash, ciphertext_hash, encryption_key_hex)`

That split is intentional:

- `plaintext_hash` identifies the logical attachment reference inside Comet markdown
- `ciphertext_hash` identifies the encrypted object stored on Blossom
- `encryption_key_hex` lets the client decrypt the downloaded ciphertext back into the plaintext attachment bytes

This means the same attachment can remain addressable inside the note by its plaintext hash, while the server only stores and serves the encrypted ciphertext object.

Local clients should persist a bridge record such as `blob_meta` that maps:

```text
plaintext_hash -> (server_url, ciphertext_hash, encryption_key)
```

When debugging:

- if the editor or markdown contains `attachment://...`, that hash is the plaintext hash
- if a Blossom URL or server object lookup is involved, that hash is usually the ciphertext hash for revision-sync blobs
- public publish flows that rewrite markdown to direct Blossom URLs may use plaintext hashes in the final URL instead of ciphertext hashes

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

For Comet, the outer `op` is the authoritative deletion signal. The inner encrypted payload does not need a second `deleted=true` marker. It only needs to carry the inner document id and inner `type` so the client can interpret what logical entity is being deleted.

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

- retain immutable revisions keyed by `(recipient, document_coord, rev)`
- store parent edges for `prev`
- materialize the current head set
- allow filtering by the revision tags used in sync

Recommendation:

- keep the relay-queryable wire surface to single-letter tags such as `p`, `d`, `r`, and `m`
- map those tags onto descriptive internal schema fields like `recipient`, `document_coord`, `rev`, and `mtime`

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
