# AGENTS

## Project

**relay/** — Relay workspace for Comet's generic snapshot-sync extension.

This relay may also carry regular Nostr traffic, but snapshot sync is the primary protocol in this workspace.

## Defaults

- Treat this project as greenfield.
- Prefer a clean snapshot-oriented design over compatibility layers.
- Keep the relay focused on local-first sync, not archival history.
- Keep Comet-specific product semantics above the generic snapshot transport where possible.

## Architecture

Use a message-driven hexagonal structure:

- protocol handlers at the edge
- storage adapters for Postgres access
- application services for publish/bootstrap/replay orchestration
- domain modules for snapshot validation and event classification

Keep generic relay traffic and snapshot-sync traffic separate even when they share transport.

## Snapshot Model

The core sync model in this workspace is:

- encrypted snapshot events
- stable document identity by `(author pubkey, d)`
- `o=put|del` outer sync metadata
- vector-clock conflict resolution in client payloads
- relay-local `CHANGES` bootstrap and tail replay
- bounded payload retention and compaction

The relay does not need a permanent ancestry graph to serve snapshot sync.

## Storage Ownership

The relay owns the snapshot-sync schema and query behavior even when shared table definitions live in `packages/data/`.

The important first-class storage concepts are:

- immutable stored snapshot metadata
- fetchable encrypted payload bodies
- relay-local ordered change log
- retention policy state
- allowlist/access control state

## Query Surface

The common query surface should stay cheap and explicit:

- fetch snapshots by event id
- filter snapshots by `authors`, `kinds`, `#d`, `#o`, and optional `#c`
- stream `CHANGES` after a relay-local sequence
- bootstrap retained snapshots for one author scope

Do not reintroduce graph-only queries or ancestry-specific storage paths.

## Testing

Use Bun test.

Keep:

- unit tests for snapshot validation and event policy
- storage tests for SQL behavior and retention/compaction
- integration tests for websocket auth, publish, fetch, bootstrap, and `CHANGES`

Prefer serial tests when shared DB state would make behavior ambiguous.

## Operations

- Keep runtime behavior stateless outside the database.
- Retention and compaction policy must be explicit and inspectable.
- Relay-local cursors are per-relay and must be exposed clearly.
- Capability advertisement should describe snapshot-sync behavior in protocol terms first.

## Reference Docs

- `docs/src/content/docs/specs/snapshot-sync-range.md`
- `docs/src/content/docs/specs/comet-note-snapshots.md`
- `docs/src/content/docs/specs/snapshot-changes-feed.md`
- `docs/src/content/docs/specs/snapshot-compaction.md`
