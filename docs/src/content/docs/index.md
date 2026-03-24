---
title: Comet Docs
description: Current sync design drafts for Comet's revision-aware multi-relay model.
template: splash
hero:
  tagline: Revision-aware sync drafts for Comet's encrypted gift-wrap, anti-entropy, and live relay feed model.
  actions:
    - text: Read Revision Gift Wrap
      link: /specs/revision-gift-wrap/
    - text: Read Revision Negentropy
      link: /specs/revision-negentropy/
---

## What lives here

This site now focuses only on the current sync design direction.

- The older docs set has been archived out of the site.
- The remaining documents describe the current revision-based sync proposal.
- The goal is to make the sync model coherent before expanding the docs surface again.

## Current Docs

- [Revision Gift Wrap](/specs/revision-gift-wrap/) defines the outer sync envelope for immutable encrypted revisions.
- [Revision Negentropy](/specs/revision-negentropy/) defines bootstrap and repair sync over logical revision identities.
- [Revision Changes Feed](/specs/revision-changes-feed/) defines the live relay tail over immutable revision events.

## Scope

These drafts are intentionally narrow.

- They focus on revision identity, anti-entropy, and live sync.
- They do not yet try to document the whole product or workspace.
- They should be treated as the active design set for Comet sync work.
