# NIP-CF: Changes Feed

`draft` `optional`

This NIP defines an optional relay extension for sequence-based event synchronization.

## Abstract

Standard Nostr sync uses timestamp-based filters (`since`), which can miss events due to timestamp collisions or clock drift. This NIP defines a changes feed — an ordered log of all mutations (stores and deletions) — that uses monotonically increasing sequence numbers for precise, reliable synchronization.

Unlike a simple event log, the changes feed tracks **state transitions**: when an event is stored, deleted via NIP-09, or superseded by a replaceable/addressable update. This allows clients to maintain a perfect mirror of the relay's state without needing to understand the semantics of each NIP that can cause event removal.

## Motivation

Timestamp-based sync has limitations:

- **Collisions**: Multiple events can share the same second-precision timestamp
- **Clock drift**: Client and relay clocks may differ
- **Imprecise checkpointing**: "Give me events since timestamp X" is fuzzy
- **Invisible removals**: Deleted or replaced events silently disappear — there is no signal for clients to remove them from their local cache

Sequence numbers solve the ordering issues, and mutation tracking solves the removal problem.

## Relay Requirements

Relays implementing this NIP:

**MUST:**

- Maintain a changelog that records every mutation (store or deletion) with a monotonically increasing sequence number
- Record a `STORED` entry when an event is persisted
- Record a `DELETED` entry when an event is removed for any reason (NIP-09 deletion, replaceable event superseded, addressable event superseded)
- Support the `CHANGES` message type
- Support live/continuous changes feeds

**MAY:**

- Suppress `DELETED` entries for superseded replaceable events when the replacement makes the deletion notification redundant. For example, if a relay uses an always-replace strategy for certain event kinds, emitting only the `STORED` entry for the new version is sufficient — the client will overwrite its local copy. This reduces changelog noise for high-frequency replacement patterns.

**SHOULD:**

- Advertise `min_seq` in their NIP-11 relay info document (see Capability Advertisement)

## Capability Advertisement

Relays MUST advertise support by including `"CF"` in their NIP-11 `supported_nips` array.

Relays SHOULD also include a `changes_feed` object in their NIP-11 document:

```json
{
  "supported_nips": [1, 9, 11, 23, "CF"],
  "changes_feed": {
    "min_seq": 1
  }
}
```

| Field     | Type    | Description                                                                                                   |
| --------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `min_seq` | integer | The oldest sequence number still available. Clients with a checkpoint older than this must do a full re-sync. |

Clients SHOULD check for `"CF"` support before using the changes feed and fall back to timestamp-based sync if not supported.

## Protocol

### CHANGES Request (client to relay)

```json
["CHANGES", <subscription_id>, <filter>]
```

The filter object supports:

| Field       | Type     | Description                                                                                         |
| ----------- | -------- | --------------------------------------------------------------------------------------------------- |
| `since`     | integer  | Return changes with seq > since. Exclusive — a `since` of 42 returns seq 43 and above. (default: 0) |
| `until_seq` | integer  | Return changes with seq <= until_seq (optional, for paginated sync)                                 |
| `limit`     | integer  | Maximum number of changes to return in this batch (optional)                                        |
| `kinds`     | int[]    | Filter by event kinds (optional)                                                                    |
| `authors`   | string[] | Filter by author pubkeys (optional)                                                                 |
| `#<tag>`    | string[] | Filter by tag values, same as NIP-01 (optional)                                                     |
| `live`      | boolean  | Keep subscription open for real-time updates after EOSE (default: false)                            |

Tag filters (e.g. `#p`, `#d`, `#t`) match against the tags of the event that caused the changelog entry. For `DELETED` entries, the relay must denormalize the original event's tags into the changelog so that tag filters work even after the event itself has been removed.

Example — initial sync of all articles by an author:

```json
[
  "CHANGES",
  "sync-1",
  {
    "since": 0,
    "kinds": [1, 30023],
    "authors": ["<pubkey>"],
    "live": true
  }
]
```

Example — sync all gift-wrapped events addressed to a pubkey:

```json
[
  "CHANGES",
  "sync-1",
  {
    "since": 0,
    "kinds": [1059],
    "#p": ["<pubkey>"],
    "live": true
  }
]
```

Example — paginated catch-up:

```json
["CHANGES", "page-1", { "since": 0, "limit": 1000 }]
["CHANGES", "page-2", { "since": 1000, "limit": 1000 }]
```

### CHANGES EVENT (relay to client)

For each stored event in the changelog:

```json
["CHANGES", <subscription_id>, "EVENT", <seq>, <event>]
```

- `seq`: The sequence number of this changelog entry (integer)
- `event`: The full Nostr event object

### CHANGES DELETED (relay to client)

For each deleted event in the changelog:

```json
["CHANGES", <subscription_id>, "DELETED", <seq>, <event_id>, <reason>]
```

- `seq`: The sequence number of this changelog entry (integer)
- `event_id`: The ID of the event that was removed (hex string)
- `reason`: Why the event was removed (object, optional fields below)

The `reason` object MAY include:

| Field           | Type   | Description                                                          |
| --------------- | ------ | -------------------------------------------------------------------- |
| `deletion_id`   | string | The event ID of the NIP-09 deletion request that caused this removal |
| `superseded_by` | string | The event ID of the newer event that replaced this one               |

Examples:

```json
["CHANGES", "s1", "DELETED", 55, "abc123...", {"deletion_id": "def456..."}]
["CHANGES", "s1", "DELETED", 56, "old999...", {"superseded_by": "new111..."}]
```

Clients do not need to understand NIP-09 or replaceable event semantics — they simply remove the referenced event ID from their local store.

Note: Clients using tombstone-based deletion patterns (where a "deleted" marker is published as a new event that replaces the original) may not need to handle `DELETED` messages at all — the deletion arrives as a regular `EVENT`. See the "Tombstone Pattern" section below.

### CHANGES EOSE (relay to client)

After sending all stored changelog entries matching the filter:

```json
["CHANGES", <subscription_id>, "EOSE", <last_seq>]
```

- `last_seq`: The relay's current maximum sequence number

The `last_seq` value is always the **global** maximum, even if no changes matched the filter. This allows clients to advance their checkpoint without re-querying the same range.

### CHANGES ERR (relay to client)

If the request cannot be processed:

```json
["CHANGES", <subscription_id>, "ERR", <message>]
```

After an error, the subscription is closed.

Common errors:

- `"checkpoint too old: min_seq is 500"` — the client's `since` value is older than the relay's retained history
- `"too many subscriptions"` — subscription limit reached

### Closing a Subscription

Clients close a changes subscription with a standard CLOSE message:

```json
["CLOSE", <subscription_id>]
```

## Live/Continuous Mode

If the client includes `"live": true` in the filter, the relay keeps the subscription open after EOSE and sends new matching changes in real-time:

```
Client: ["CHANGES", "s1", {"since": 42, "kinds": [1], "live": true}]
Relay:  ["CHANGES", "s1", "EVENT",   43, {kind:1 event...}]
Relay:  ["CHANGES", "s1", "EVENT",   50, {kind:1 event...}]
Relay:  ["CHANGES", "s1", "EOSE",    50]
-- subscription stays open --
Relay:  ["CHANGES", "s1", "EVENT",   51, {new event...}]
Relay:  ["CHANGES", "s1", "DELETED", 52, "abc...", {"deletion_id": "def..."}]
Relay:  ["CHANGES", "s1", "EVENT",   53, {another event...}]
...
Client: ["CLOSE", "s1"]
```

Both `EVENT` and `DELETED` entries are streamed in live mode. This means a client with a live subscription will be notified immediately when an event it cares about is deleted or replaced.

## Changelog Schema

Relays MAY implement the changelog however they choose, but a reference schema is provided:

```sql
CREATE TABLE changes (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   TEXT NOT NULL,
  type       TEXT NOT NULL CHECK(type IN ('STORED', 'DELETED')),
  kind       INTEGER,            -- denormalized for filtered queries
  pubkey     TEXT,                -- denormalized for filtered queries
  reason     TEXT                 -- JSON: {"deletion_id": "..."} or {"superseded_by": "..."}
);

-- Denormalized tags for changelog entries, enabling tag-filtered queries
-- (e.g. #p, #d) to work even after the original event has been deleted.
CREATE TABLE change_tags (
  change_seq INTEGER NOT NULL REFERENCES changes(seq),
  tag_name   TEXT NOT NULL,      -- single-letter tag name (e.g. "p", "d", "t")
  tag_value  TEXT NOT NULL
);
CREATE INDEX idx_change_tags ON change_tags(tag_name, tag_value);
```

The `kind` and `pubkey` columns are denormalized from the event to allow efficient filtered changelog queries without joining the events table (which may no longer contain deleted events). The `change_tags` table serves the same purpose for tag-based filters.

## Client Implementation

### Sync Flow

**Initial sync:**

```javascript
const info = await fetch(relayUrl, {
  headers: { Accept: "application/nostr+json" },
});
const nip11 = await info.json();

if (nip11.supported_nips?.includes("CF")) {
  send(["CHANGES", "sync", { since: 0, kinds: [1, 30023], live: true }]);
} else {
  send(["REQ", "sync", { kinds: [1, 30023] }]);
}
```

**Processing responses:**

```javascript
let checkpoint = loadCheckpoint() || 0;

relay.on("message", (msg) => {
  if (msg[0] !== "CHANGES" || msg[1] !== "sync") return;

  if (msg[2] === "EVENT") {
    const [, , , seq, event] = msg;
    storeEvent(event);
    checkpoint = seq;
  } else if (msg[2] === "DELETED") {
    const [, , , seq, eventId, reason] = msg;
    removeEvent(eventId);
    checkpoint = seq;
  } else if (msg[2] === "EOSE") {
    const [, , , lastSeq] = msg;
    checkpoint = lastSeq;
    saveCheckpoint(checkpoint);
  } else if (msg[2] === "ERR") {
    const [, , , message] = msg;
    if (message.includes("checkpoint too old")) {
      // Need full re-sync
      checkpoint = 0;
      clearLocalStore();
      send(["CHANGES", "sync", { since: 0, kinds: [1, 30023], live: true }]);
    }
  }
});
```

**Incremental sync (next session):**

```javascript
send(["CHANGES", "sync", { since: checkpoint, kinds: [1, 30023], live: true }]);
```

### Checkpoint Storage

Clients SHOULD persist their checkpoint (last seen sequence number) to enable efficient incremental sync across sessions.

Note: Sequence numbers are relay-specific. Clients syncing from multiple relays need separate checkpoints for each.

### Stale Checkpoint Recovery

If a client's checkpoint is older than the relay's `min_seq`, incremental sync is impossible. The relay will respond with an ERR. Clients SHOULD handle this by:

1. Clearing their local store for that relay
2. Re-syncing from `since: 0`

## Tombstone Pattern

An alternative to relying on `DELETED` messages for tracking removals is the **tombstone pattern**: instead of deleting an event, the client publishes a new event that replaces the original and contains a "deleted" marker.

This works well with replaceable or addressable events. The client publishes a replacement event with minimal content and a tag indicating deletion (e.g. `["deleted", "true"]`). The relay records this as a normal `STORED` entry. Receiving clients see the tombstone arrive as an `EVENT` and handle the deletion locally.

Advantages:

- Clients only need to handle `EVENT` messages — no `DELETED` processing required
- The deletion is an event itself, so it participates in the same encryption, wrapping, and relay replacement logic as regular events
- Relays that suppress `DELETED` for superseded events (see Relay Requirements) produce a cleaner changelog

This pattern is particularly useful for encrypted sync scenarios (e.g. NIP-59 gift wraps) where the relay cannot inspect event content to understand deletion semantics.

## Interaction with Other NIPs

### NIP-01 (Basic Protocol)

CHANGES subscriptions reuse the NIP-01 tag filter syntax (`#<tag>`). Relays MUST support the same tag filter semantics for CHANGES as they do for REQ.

### NIP-09 (Event Deletion)

When a NIP-09 deletion request removes events, the relay records a `DELETED` changelog entry for each removed event. The `reason` includes the `deletion_id` so clients can attribute the deletion. The deletion request event itself is recorded as a `STORED` entry (since it is persisted).

### NIP-42 (Authentication)

Relays MAY require NIP-42 authentication before accepting CHANGES subscriptions. This is particularly relevant for relays that store private data (e.g. NIP-59 gift wraps) where the changes feed should only be accessible to authorized users. Relays SHOULD apply the same authentication and authorization rules to CHANGES as they do to REQ.

### Replaceable Events (kinds 0, 3, 10000-19999)

When a newer replaceable event supersedes an older one, the relay records:

1. `DELETED` for the old event (with `superseded_by` pointing to the new event)
2. `STORED` for the new event

Relays MAY omit the `DELETED` entry if the replacement is self-evident (see Relay Requirements).

### Addressable Events (kinds 30000-39999)

Same as replaceable events — old versions produce `DELETED` entries with `superseded_by`, the new version produces a `STORED` entry.

### Ephemeral Events (kinds 20000-29999)

Ephemeral events are not stored and do not appear in the changelog.

## Security Considerations

- Sequence numbers reveal information about relay activity (total event count, mutation frequency)
- Relays SHOULD rate-limit changes feed requests like other subscriptions
- The `limit` and `until_seq` parameters help prevent excessive resource usage
- Relays MAY compact old changelog entries and advance `min_seq` to bound storage growth
- Relays that require authentication (NIP-42) SHOULD enforce it before allowing CHANGES subscriptions to prevent unauthorized enumeration of relay state
