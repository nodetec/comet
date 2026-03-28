# Bear-Style Tags Implementation

Date: 2026-03-28

## Purpose

This directory breaks the Bear-style tagging implementation for Comet into separate planning documents. The intended reading order is:

1. `01-phase-1-contract-and-parser-spec-COMPLETE.md`
2. `02-phase-2-data-model-and-indexing-COMPLETE.md`
3. `03-phase-3-migration-and-backfill-COMPLETE.md`
4. `04-phase-4-editor-and-inline-authoring-COMPLETE.md`
5. `05-phase-5-sidebar-search-and-navigation-COMPLETE.md`
6. `06-phase-6-tag-management-and-metadata-COMPLETE.md`
7. `07-phase-7-sync-publish-export-COMPLETE.md`
8. `08-phase-8-hardening-rollout-COMPLETE.md`

## Current Status

The implementation packet started from Comet's old flat-tag model, but the codebase is now on the Bear-style tag system end to end.

Current runtime status:

- markdown is the source of truth for authored tags
- tags are parsed with nested and wrapped syntax support
- tags are indexed in normalized `tags` and `note_tag_links` tables
- the editor, sidebar, search, sync, publish, export, and repair flows all use the canonical direct-tag model
- there is no runtime dependency on the old `note_tags` table

The only remaining `note_tags` references are historical:

- versioned migration history
- planning documents in this directory that describe the original starting point

## Delivery Recommendation

The cleanest milestone split is:

- Milestone 1: phases 1 through 4
- Milestone 2: phases 5 through 6
- Milestone 3: phases 7 through 8

That sequence gets the parser, schema, indexing, and editor right before spending time on the higher-level UX and operational polish. The runtime cutover itself should still be a single clean switch once phases 1 through 4 are implemented.
