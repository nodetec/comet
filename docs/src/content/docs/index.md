---
title: Comet Docs
description: Current sync and storage design drafts for local-first note sync, relay transport, and attachment workflows.
template: splash
hero:
  tagline: Local-first note sync drafts for a dedicated sync kind range, relay transport, and attachment pipeline.
  actions:
    - text: Read Causal Sync Range
      link: /specs/causal-snapshot-sync-range/
    - text: Read Sync Changes Feed
      link: /specs/snapshot-changes-feed/
---

## What lives here

This site now focuses on the current sync and storage transport design direction.

- The older docs set has been archived out of the site.
- The remaining documents describe the current local-first note sync proposal and adjacent transport extensions.
- The goal is to make the sync and attachment model coherent before expanding the docs surface again.

## Current Docs

- [Causal Snapshot Sync Range](/specs/causal-snapshot-sync-range/) reserves a dedicated sync kind range and defines the required causal metadata for local-first snapshot sync events.
- [Comet Note Snapshots](/specs/comet-note-snapshots/) defines Comet's first concrete sync kind, `42061`, as an encrypted full-note snapshot with vector clocks, durable tombstones, and bounded local history.
- [Snapshot Changes Feed](/specs/snapshot-changes-feed/) defines relay-local bootstrap, ordered replay, and live follow for snapshot sync events.
- [Snapshot Retention And Compaction](/specs/snapshot-compaction/) defines bounded retention and compaction rules for snapshot sync events, including current relay/local defaults.
- [Blossom Batch Upload](/specs/blossom-batch-upload/) drafts a backward-compatible multi-blob upload extension for attachment-heavy clients.

## Scope

These drafts are intentionally narrow.

- They focus on local-first note identity, relay replay, bounded retention, and adjacent attachment transport.
- They do not yet try to document the whole product or workspace.
- They should be treated as the active design set for Comet sync and storage work.
