# AGENTS

## Project

**relay/** — Relay workspace for a generic revision-sync extension, with Comet as the first client/profile.

This workspace is the clean replacement for the current sync-specific behavior embedded in `relay/`.

It may also serve regular Nostr relay traffic that does not participate in the revision model, but that support must be classified explicitly as one of:

- **companion kinds**
  - generic Nostr events Comet intentionally relies on alongside revision sync
  - these deserve explicit indexing, retention, and protocol guarantees
- **pass-through kinds**
  - generic events the relay is willing to carry without elevating them into the revision-sync model
  - these must not distort the core schema or retention design

Do not leave this distinction implicit in implementation.
Support for non-revision kinds must be explicitly classified before it influences schema, indexing, retention, `CHANGES`, or Negentropy behavior.
Pass-through kinds are transport behavior only unless promoted explicitly.
Companion kinds must declare their indexing, query, and retention guarantees explicitly.

## Defaults

- Treat this project as greenfield.
- Prefer a clean revision-native design over compatibility with the old replaceable-slot relay model.
- Do not carry forward temporary transition logic once a cleaner baseline exists.
- Keep the relay narrowly focused on sync. It is not a general archival history product.
- Design the revision-sync model as a generic relay extension that any relay could implement.
- Keep Comet-specific product choices above the protocol layer whenever possible.

## Architecture Pattern

Use a **Message-Driven Hexagonal** architecture.

That means:

- protocol handlers live at the edge
- business rules live in the core
- storage and runtime concerns are adapters

This relay should have one shared protocol/runtime shell with two distinct domains behind it:

- **generic relay domain**
  - standard Nostr event handling
  - generic event validation, query, and storage
  - generic subscriptions and relay behavior
  - companion-kind and pass-through-kind handling
- **revision sync extension domain**
  - revision-tagged sync events only
  - `d` / `rev` / `prev` / `op`
  - materialized heads
  - revision-aware Negentropy
  - revision-aware `CHANGES`

Do not force regular events through revision abstractions.
Do not weaken revision sync rules to make them look like generic relay CRUD.
Do not bake Comet-specific note semantics into the extension layer unless they are truly protocol-level concepts.

## Runtime

- This workspace is written for **Bun** first.
- Use TypeScript with native ESM.
- Prefer Bun-native runtime APIs where they are a clear fit.
- Keep startup, test, and build commands aligned with the existing Bun workspaces in the repo.

## Structure

Use a structure that separates protocol, storage, and runtime wiring clearly:

```text
src/
├── index.ts           # Bun entrypoint
├── server.ts          # HTTP/WebSocket server bootstrap
├── db.ts              # Database connection and lifecycle
├── types.ts           # Wire and storage-facing shared types
├── protocol/          # Wire protocol handlers and message types
│   ├── auth.ts
│   ├── changes.ts
│   ├── negentropy.ts
│   ├── relay.ts
│   └── revisions.ts
├── storage/           # Persistence logic and queries
│   ├── events.ts
│   ├── revisions.ts
│   ├── heads.ts
│   ├── changes.ts
│   └── compaction.ts
├── domain/            # Pure sync rules and invariants
│   ├── events/
│   ├── revisions/
│   ├── subscriptions/
│   └── auth/
└── application/       # Use-case orchestration between protocol and storage
    ├── relay/
    └── revisions/
infra/                 # Runtime-specific glue
    ├── connections.ts
    └── config.ts

test/
├── helpers.ts
├── protocol/
├── storage/
└── integration/
```

The exact file names can change, but the separation should hold:

- protocol parsing and message flow
- application orchestration
- storage queries and transactions
- generic relay domain rules
- revision sync domain rules
- runtime wiring

## Conventions

- Imports: prefer local absolute patterns only if the workspace establishes them cleanly; otherwise keep imports straightforward and stable.
- Files: `lowercase.ts` for modules, `*.test.ts` for tests.
- Keep domain logic pure where possible. Put DB writes and websocket IO at the edges.
- Prefer explicit types at protocol boundaries.
- Avoid “god modules” that mix websocket flow, SQL, and merge logic in one file.
- Keep generic event handling and revision-sync handling in separate modules even when they share transport.

## Database Ownership

- This relay owns the revision-sync data model and query requirements, even when the shared table definitions live in `packages/data/`.
- Do not overload generic relay tables when a first-class revision table is clearer.
- Revision fields required for sync correctness must be first-class queryable data.
- Relay-queryable revision fields on the wire should use single-letter tags.
- The current indexed/queryable wire surface is:
  - `#p` recipient namespace
  - `#d` document coordinate
  - `#r` revision identity
- At minimum, `recipient`, `d`, `rev`, and `mtime` must be queryable without decrypting payloads.
- `mtime` is the logical revision timestamp carried in revision metadata.
- `mtime` is distinct from the outer Nostr event `created_at` and from relay-local `CHANGES` sequence numbers.
- Acceptable approaches are:
  - dedicated columns and tables for revision concepts
  - indexing the extension's single-letter query surface for sync kinds
- Non-queryable revision metadata may use more descriptive tag names until promoted into the indexed/query surface.
- Schema should separate:
  - generic event storage
  - immutable revision metadata
  - parent edges
  - materialized current heads
  - fetchable payload bodies
  - ordered change log
- If shared schema code lives in `packages/data/`, keep ownership explicit and relay-focused. Do not force the schema back into generic-relay abstractions.

## Query Rules

- Make the common queries cheap and explicit:
  - fetch generic events and subscriptions
  - fetch current heads
  - fetch revisions by `rev`
  - walk parent edges
  - stream `CHANGES` after `seq`
  - run revision-aware anti-entropy over current materialized heads
- Do not hide critical sync queries behind overly generic repositories.
- If anti-entropy over any broader set than current heads is ever added, it must be an explicit separate mode with its own retention and correctness rules.

## Protocol Boundaries

- Treat websocket messages as a protocol layer, not as ad hoc JSON handling.
- Validate message shape early.
- Keep message decoding separate from business rules.
- Keep auth checks separate from revision apply logic.
- Route messages explicitly to either the generic relay application layer or the revision-sync application layer.
- Keep protocol extension messages generic enough that another relay implementation could reproduce the same behavior without depending on Comet internals.

## Testing

- Use Bun test.
- Keep unit tests for pure domain rules:
  - revision validation
  - ancestry checks
  - head derivation
  - compaction eligibility
- Keep storage tests focused on real SQL behavior and transactions.
- Keep integration tests for websocket protocol flow:
  - auth
  - generic event publish/query
  - revision publish
  - `CHANGES`
  - Negentropy bootstrap
  - bootstrap handoff to `CHANGES`
- Prefer serial tests when shared DB state would otherwise make behavior ambiguous.

## Operations

- Keep deployment assumptions simple: Bun process, Postgres, and explicit environment variables.
- Prefer stateless runtime behavior outside the database.
- Retention and compaction policy must be explicit and inspectable.
- Anything the client needs to reason about sync safety should be advertisable by the relay.
- `CHANGES` cursors are relay-local. Clients must track one cursor per relay.
- Capability advertisement should describe the extension in protocol terms first, not in Comet product terms first.

## Core Model

- Sync payloads are encrypted gift wraps carrying stable outer revision metadata.
- Document identity is stable and separate from transport event identity.
- Logical revisions are immutable.
- Revision ancestry is explicit.
- Current document state is derived from head revisions, not from in-place replacement.
- Logical deletion is a tombstone revision, not a hard delete of current state.
- Comet may be the first profile, but the extension model must not assume a notes-only application forever.

## Required Concepts

Any design in this workspace should preserve these first-class concepts:

- `recipient`: extension-level routing and scoping key derived from the outer gift-wrap recipient tag
- `d`: logical document coordinate within a recipient-specific namespace
- `rev`: stable logical revision identity
- `prev`: parent revision identity, repeatable for merges
- `op`: logical operation, at minimum `put` and `del`
- `mtime`: logical revision timestamp used for revision ordering and anti-entropy
- relay sequence numbers for `CHANGES`
- a clear bootstrap handoff from revision Negentropy to live `CHANGES`

These concepts should be treated as extension-level protocol concepts, not as Comet-private implementation details.
`recipient` originates from the outer gift-wrap transport envelope, but it is still a first-class extension concept because revision scope, head tracking, and anti-entropy are all evaluated within a recipient-specific namespace.
`d` is not globally unique on its own. Document identity is namespaced by `(recipient, d)`, and revision identity is namespaced by `(recipient, d, rev)`.
For wire/query purposes, the extension currently maps these concepts to single-letter tags:

- `p` -> recipient
- `d` -> document coordinate
- `r` -> revision identity
- `m` -> logical revision timestamp

## Storage Rules

- Store immutable revision metadata separately from fetchable payload bodies.
- Store revision parent edges explicitly.
- Materialize current heads on write. Rebuilds may derive them, but normal reads should not.
- Keep `CHANGES` as an ordered relay-local mutation log.
- Do not overload one table to serve simultaneously as:
  - current head state
  - immutable revision graph
  - payload retention store

## Protocol Rules

- Do not use the outer Nostr event ID as the durable logical revision identity.
- Do not rely on deterministic ciphertext, deterministic nonces, or deterministic ephemeral wrapping keys.
- Negentropy in this workspace is revision-aware anti-entropy over logical revision IDs, not plain event-ID reconciliation.
- The default Negentropy scope is the set of current materialized heads for the requested revision scope.
- Revision anti-entropy uses the extension-defined logical revision ordering time, `mtime`, not relay-local `seq` and not outer event `created_at`.
- `CHANGES` is the live and incremental tail protocol.
- Bootstrap and repair may use revision-aware Negentropy, but live sync should resume through `CHANGES`.
- `CHANGES` sequence numbers are relay-local only. They must never be treated as a cross-relay ordering mechanism.
- When possible, protocol message names, capabilities, and semantics should be designed so they could stand alone as future NIP material.

## Compaction Rules

- Treat `CHANGES` compaction, payload compaction, and revision-graph compaction as separate concerns.
- Prefer compacting old payload bodies before compacting revision metadata.
- Never compact current heads or unresolved conflict heads.
- Keep retention policies explicit and advertisable.
- If a payload body has been compacted, the relay must expose that state explicitly rather than failing ambiguously.
- The default Negentropy scope must remain valid under compaction, which is why current heads are the baseline anti-entropy set.

## Product Boundaries

- User-facing version history is not the relay's primary responsibility.
- The relay should support correct sync, conflict detection, and bounded retention.
- Do not embed rolling version-history bundles into the current note payload.

## Avoid

- Reintroducing `kind:1059 + p + d` replaceable-slot semantics
- Timestamp-only last-write-wins as the sole sync truth
- Single global checkpoint assumptions
- Single-relay assumptions in data model or protocol design
- Bundling old versions into every synced note payload
- General-purpose relay abstractions that weaken the revision model
- Routing all events through one shared storage and business-logic path when the generic and revision domains have different invariants
- Comet-specific naming or note-model assumptions in the extension layer when a protocol-generic concept is available

## Working References

These docs are the active design references for this workspace:

- `docs/src/content/docs/specs/revision-gift-wrap.md`
- `docs/src/content/docs/specs/revision-negentropy.md`
- `docs/src/content/docs/specs/revision-changes-feed.md`

Treat those docs as extension-design docs first and Comet implementation guides second.

If implementation pressure conflicts with these documents, update the documents or the implementation so they match. Do not let the protocol drift silently.
