---
title: Revision Batch Fetch
description: Comet relay extension for batched revision payload download after negentropy.
---

# Revision Batch Fetch

This document describes Comet's relay extension for downloading missing revision payloads in batches after a `NEG-OPEN` / `NEG-MSG` reconciliation pass.

It is intentionally not a NIP. It is a backward-compatible relay extension advertised through extra fields in the relay's NIP-11 document. Clients must fall back to standard `REQ` when the relay does not advertise support.

## Why It Exists

NIP-77 solves the set reconciliation problem. It tells the client which revision IDs it is missing, but it does not transfer the actual revision payloads.

The standard follow-up path is:

1. Run negentropy over current heads.
2. Collect the missing revision IDs.
3. Download the matching events with `REQ`.
4. Receive one `EVENT` frame per revision until `EOSE`.

That works, but initial sync can still feel slow when the client is missing many revisions because the relay emits one websocket frame per event.

`REQ-BATCH` reduces websocket frame overhead by returning chunked `EVENTS` messages instead.

## Capability Advertisement

Relays advertise support in the `revision_sync` section of the NIP-11 relay info document.

Example:

```json
{
  "revision_sync": {
    "strategy": "revision-sync.v1",
    "current_head_negentropy": true,
    "changes_feed": true,
    "recipient_scoped": true,
    "batch_fetch": true,
    "retention": {
      "min_payload_mtime": null
    }
  }
}
```

Rules:

- Clients must only use `REQ-BATCH` when `batch_fetch` is `true`.
- Clients must fall back to standard `REQ` when `batch_fetch` is missing or `false`.
- Clients must ignore unknown `revision_sync` fields.

## Message Types

### Client to relay

```json
["REQ-BATCH", "<subscription-id>", <filter>, ...]
```

`REQ-BATCH` uses the same filter semantics as NIP-01 `REQ`.

For revision bootstrap, Comet uses:

```json
[
  "REQ-BATCH",
  "bootstrap-fetch",
  {
    "kinds": [1059],
    "#p": ["<recipient-pubkey>"],
    "#r": ["<revision-id-1>", "<revision-id-2>", "..."]
  }
]
```

### Relay to client

```json
["EVENTS", "<subscription-id>", [<event>, <event>, ...]]
```

The relay may send zero or more `EVENTS` messages for a subscription. Each `EVENTS` frame contains an ordered chunk of revision payload events.

The relay may also send:

```json
[
  "EVENT-STATUS",
  "<subscription-id>",
  { "rev": "<revision-id>", "status": "payload_compacted" }
]
```

for revisions whose payloads are no longer retained.

The subscription completes with:

```json
["EOSE", "<subscription-id>"]
```

## Ordering and Semantics

- `REQ-BATCH` preserves the same result semantics as `REQ`.
- `EVENTS` is only a transport optimization. It does not change filtering, auth, or retention behavior.
- Event ordering should match the relay's normal revision query ordering.
- `EOSE` still marks completion for the subscription.
- `EVENT-STATUS` still reports compacted payloads the same way the standard `REQ` path does.

## Relay Behavior

Current Comet relay behavior:

- Accept `REQ-BATCH` with the same auth and filter validation as `REQ`.
- Query the matching revision events.
- Chunk the result set into bounded `EVENTS` frames.
- Emit any `EVENT-STATUS` compacted payload notices.
- Emit `EOSE`.

Malformed requests return:

```json
[
  "NOTICE",
  "invalid: REQ-BATCH requires a string subscription id and object filters"
]
```

## Client Behavior

Recommended client flow:

1. Fetch relay info.
2. Run negentropy and collect missing revision IDs.
3. If `batch_fetch` is supported, issue `REQ-BATCH`.
4. Otherwise, issue standard `REQ`.
5. Apply all fetched revisions.

Comet batches the DB apply phase as well:

- collect the fetched events first
- apply them inside one SQLite transaction
- invalidate UI/cache state after commit

## Compatibility

This extension is fully optional.

- Old clients keep using standard `REQ`.
- Old relays ignore `REQ-BATCH` as an unknown message type unless they choose to implement it.
- New clients must preserve fallback to `REQ`.

## Status

This is a Comet relay extension, not a NIP.

If the message shape proves stable and useful across multiple implementations, it could later be proposed as a standard batching extension for post-negentropy payload transfer.
