---
title: Comet Docs
description: Current sync and storage design drafts for revision-oriented sync events, relay transport, and attachment workflows.
template: splash
hero:
  tagline: Revision-aware sync and storage drafts for a dedicated sync kind range, relay transport, and attachment pipeline.
  actions:
    - text: Read Revision Sync Range
      link: /specs/revision-sync-range/
    - text: Read Sync Changes Feed
      link: /specs/revision-changes-feed/
---

## What lives here

This site now focuses on the current sync and storage transport design direction.

- The older docs set has been archived out of the site.
- The remaining documents describe the current revision-based sync proposal and adjacent transport extensions.
- The goal is to make the sync and attachment model coherent before expanding the docs surface again.

## Current Docs

- [Revision Sync Range](/specs/revision-sync-range/) reserves a dedicated sync kind range and defines sync metadata for revision events.
- [Comet Note Revisions](/specs/comet-note-revisions/) defines Comet's first concrete sync kind, `42061`, and commits Comet to event-native local storage.
- [Sync Changes Feed](/specs/revision-changes-feed/) defines relay-local bootstrap, ordered replay, and live follow for sync-range events.
- [Sync Retention And Compaction](/specs/revision-compaction/) defines retention layers and compaction rules for sync-range events.
- [Blossom Batch Upload](/specs/blossom-batch-upload/) drafts a backward-compatible multi-blob upload extension for attachment-heavy clients.

## Scope

These drafts are intentionally narrow.

- They focus on revision identity, relay replay, retention/compaction, and adjacent attachment transport.
- They do not yet try to document the whole product or workspace.
- They should be treated as the active design set for Comet sync and storage work.
