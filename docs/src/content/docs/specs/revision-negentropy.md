---
title: Revision Negentropy
description: Draft Comet anti-entropy protocol that applies the Negentropy algorithm to logical revision identities instead of raw event IDs.
sidebar:
  label: Revision Neg
  order: 2
---

`draft`

Related drafts:

- [Revision Gift Wrap](/specs/revision-gift-wrap/)
- [Revision Changes Feed](/specs/revision-changes-feed/)

## Summary

Comet should use the Negentropy algorithm over logical revision identities, not over today's outer gift-wrap event IDs.

This is a Comet-specific profile of the Negentropy pattern rather than plain NIP-77 semantics.

The reason is simple:

- NIP-77 assumes the reconciled IDs are event IDs
- Comet's outer gift-wrap event IDs are intentionally unstable across relays
- Comet needs anti-entropy over stable logical revisions instead

## Goals

- Efficient initial sync to a new relay
- Efficient repair between relays
- Efficient re-sync after local cache loss
- Clean handoff from anti-entropy bootstrap to live relay sync
- No requirement for deterministic ciphertext or deterministic outer events

## Non-Goals

- Replacing the live `CHANGES` feed
- Strict wire compatibility with NIP-77 event-ID semantics

## Record Model

Each reconciled Negentropy item should be a logical revision record:

- `timestamp = mtime`
- `id = rev`

Where:

- `mtime` is the revision ordering hint from the outer gift-wrap tag
- `rev` is the stable 32-byte logical revision identity from the outer gift-wrap tag

For this extension, `mtime` is the extension-defined logical revision ordering time.

- use `mtime` for revision ordering and anti-entropy
- do not substitute the outer Nostr event `created_at`
- do not confuse it with relay-local `CHANGES` sequence numbers

The Negentropy algorithm only needs a set of `(timestamp, 32-byte id)` items, so this mapping fits the algorithm cleanly.

## Why Plain NIP-77 Is Not Enough

Plain NIP-77 says the client and relay learn which IDs they have or need, then fetch or upload the corresponding events.

That works when the reconciled ID is the event ID.

It does not fit Comet's current outer gift wraps, because the same logical revision may have different outer event IDs on different relays.

For Comet:

- the reconciled ID must be `rev`
- the fetched or uploaded payload is the gift-wrapped sync event that carries that `rev`

## Scope Selection

The candidate set for a Negentropy session should be selected using normal filter-style scoping, typically:

```json
{
  "kinds": [1059],
  "#p": ["<recipient_pubkey>"]
}
```

The recipient scope is first-class for this extension. Revision identities are reconciled within a recipient-specific namespace derived from the outer gift-wrap `p` tag.

Additional narrowing by document or revision may use tags such as:

- `#d`
- `#r`

The relay may build the Negentropy set either from:

- materialized current heads, or
- dedicated revision tables that can derive that head set cheaply

The recommended default is:

- Negentropy runs over the **current materialized heads** in the requested scope

Why this is the default:

- initial sync needs current document state first
- it stays correct under payload compaction
- it avoids requiring infinite retained revision history
- it keeps bootstrap cost bounded as revision graphs grow

Anti-entropy over a broader retained revision set is possible later, but it should be treated as a separate explicit mode with its own retention guarantees.

## Message Model

This draft keeps the basic Negentropy message flow:

- `NEG-OPEN`
- `NEG-STATUS`
- `NEG-MSG`
- `NEG-ERR`
- `NEG-CLOSE`

The Comet-specific difference is semantic:

- the filter scopes Comet revision gift wraps
- the reconciled item IDs are `rev`
- the client and relay interpret the diff as "missing logical revisions"

That means a Comet relay and client must explicitly agree on the revision strategy for a session.

### `NEG-STATUS`

Comet should add a relay message sent immediately after `NEG-OPEN` is accepted:

```json
[
  "NEG-STATUS",
  "<subscription_id>",
  {
    "strategy": "revision-sync.v1",
    "snapshot_seq": 12345
  }
]
```

Field meanings:

- `strategy`: the negotiated Comet revision strategy for this session
- `snapshot_seq`: the relay's current max `CHANGES` sequence number when the Negentropy snapshot begins

Semantics:

- the relay must build the Negentropy candidate set from revisions with `stored_seq <= snapshot_seq`
- revisions accepted after `snapshot_seq` are outside the bootstrap snapshot
- the client must use `snapshot_seq` as the boundary for the later `CHANGES` handoff
- `snapshot_seq` is scoped only to the relay serving this Negentropy session

This extension keeps session metadata out of the Negentropy binary payload and makes the handoff to live sync explicit.

### `NEG-ERR`

If a Negentropy session cannot continue, the relay should respond with:

```json
["NEG-ERR", "<subscription_id>", "<message>"]
```

Examples:

- unknown subscription ID
- invalid recipient scope
- unsupported revision strategy

The relay should use `NEG-ERR` for session-scoped Negentropy failures rather than collapsing them into a generic relay `NOTICE`.

## Transport After Reconciliation

Once the client learns which revisions are missing:

- download missing remote revisions with `REQ`
- upload missing local revisions with `EVENT`

Recommended fetch shape:

- `kind:1059`
- `#p = recipient`
- `#r = missing revision IDs`

This requires the relay to index the revision tag used for sync.

The bootstrap fetch path can be a normal `REQ` using the missing `rev` list. A relay does not need a separate fetch endpoint if standard event querying can express:

```json
[
  "REQ",
  "fetch-1",
  { "kinds": [1059], "#p": ["<recipient>"], "#r": ["<rev1>", "<rev2>"] }
]
```

If the relay knows a requested revision but no longer retains its payload body, it should respond explicitly rather than failing silently:

```json
["EVENT-STATUS", "fetch-1", { "rev": "<rev1>", "status": "payload_compacted" }]
```

That lets the client distinguish:

- requested and fetchable
- requested but compacted
- requested but unknown

The revision fields used by sync must be first-class queryable data. In practice that means either:

- dedicated columns and tables for revision metadata, or
- indexing the extension's single-letter query surface for sync kinds

The current queryable wire surface is intentionally small and Nostr-friendly:

- `#p` recipient namespace
- `#d` document coordinate
- `#r` revision identity

## Handoff To `CHANGES`

The relay snapshot boundary must be explicit so the client can avoid a race window.

Recommended bootstrap flow:

1. Open the websocket and authenticate.
2. Send `NEG-OPEN` for the revision scope.
3. Receive `NEG-STATUS` with `snapshot_seq = S`.
4. Complete the Negentropy exchange against the frozen snapshot.
5. Download missing remote revisions by `rev`.
6. Upload missing local revisions with `EVENT`.
7. Start `CHANGES` with `since = S` and `live = true`.
8. Apply tail revisions accepted after the snapshot and persist the relay checkpoint.

This gives each protocol a clean responsibility:

- Negentropy answers "which revisions were missing at snapshot `S`?"
- `CHANGES` answers "what happened after snapshot `S`?"

## Relay-Local Cursor Model

`CHANGES` sequence numbers are relay-local, not global.

That means:

- the client must keep one cursor per relay
- the client must run Negentropy and `CHANGES` handoff independently per relay
- two relays may assign different sequence numbers while storing the same logical revision
- cross-relay convergence happens through stable logical revision IDs like `rev`, not through `seq`

## Relay Requirements

To support revision-aware Negentropy, the relay should:

- retain immutable revisions rather than only the latest `p + d` head
- expose the revision tags needed to fetch specific revisions
- compute Negentropy sets over logical revisions, not raw outer event IDs
- expose `snapshot_seq` for the bootstrap handoff
- expose session-scoped Negentropy failures explicitly, e.g. through `NEG-ERR`

## Client Requirements

To support revision-aware Negentropy, the client should:

- maintain a local set of known revision IDs per relay scope
- maintain a separate checkpoint/cursor per relay
- treat `rev` as the anti-entropy identity
- treat the outer event ID as transport-specific

## Relationship To `CHANGES`

Negentropy should be used for:

- cold-start sync
- relay repair
- cache rebuilds

`CHANGES` should remain the primary protocol for:

- ongoing incremental sync
- live updates
- relay-specific checkpointing

Negentropy answers:

- which logical revisions are missing?

`CHANGES` answers:

- what happened after the client was already caught up?

## Open Questions

- How the relay and client should negotiate the revision strategy on the wire
- Whether the relay should expose a direct "fetch revisions by `rev`" helper in addition to normal `REQ`
- Whether the relay should eventually expose more snapshot metadata than `snapshot_seq`

## Final Recommendation

Comet should adopt a modified Negentropy profile that reconciles logical revision IDs (`rev`) instead of raw Nostr event IDs.

That keeps the algorithmic benefit of Negentropy while matching Comet's privacy-preserving gift-wrap model and giving bootstrap a clean handoff into live `CHANGES`.
