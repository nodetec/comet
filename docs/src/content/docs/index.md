---
title: Comet Docs
description: Current sync and storage design drafts for Comet's revision-aware multi-relay model.
template: splash
hero:
  tagline: Revision-aware sync and storage drafts for Comet's encrypted gift-wrap, anti-entropy, relay transport, and attachment pipeline.
  actions:
    - text: Read Revision Gift Wrap
      link: /specs/revision-gift-wrap/
    - text: Read Revision Negentropy
      link: /specs/revision-negentropy/
---

## What lives here

This site now focuses on the current sync and storage transport design direction.

- The older docs set has been archived out of the site.
- The remaining documents describe the current revision-based sync proposal and adjacent transport extensions.
- The goal is to make the sync and attachment model coherent before expanding the docs surface again.

## Current Docs

- [Revision Gift Wrap](/specs/revision-gift-wrap/) defines the outer sync envelope for immutable encrypted revisions.
- [Revision Negentropy](/specs/revision-negentropy/) defines bootstrap and repair sync over logical revision identities.
- [Revision Batch Fetch](/specs/revision-batch-fetch/) defines Comet's batched payload download extension after negentropy.
- [Revision Changes Feed](/specs/revision-changes-feed/) defines the live relay tail over immutable revision events.
- [Blossom Batch Upload](/specs/blossom-batch-upload/) drafts a backward-compatible multi-blob upload extension for attachment-heavy clients.

## Scope

These drafts are intentionally narrow.

- They focus on revision identity, anti-entropy, live sync, and adjacent attachment transport.
- They do not yet try to document the whole product or workspace.
- They should be treated as the active design set for Comet sync and storage work.
