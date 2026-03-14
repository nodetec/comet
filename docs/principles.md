# Principles

Maintenance rule: update this document when the product or UX philosophy changes, not when individual screens or components change.

## Product Principles

### Leave a trail

`comet` should help users accumulate a visible trail of thought over time. That trail is built through recency, revisiting, linking, and occasional publishing, not through elaborate organization systems.

### Notes are the center

Everything should make note capture, writing, retrieval, linking, or publishing better. If a feature mainly adds management overhead, it should wait.

### Beauty is functional

For this product, beauty is not cosmetic. A note app that feels calm, legible, and native invites regular use. Typography, spacing, and visual restraint are core product decisions.

### Owned by the user

The app should behave like a trustworthy local tool, not a black box. Notes live locally, use markdown as the content format, and should be easy to export or back up.

### One-player first

The reference case is one thoughtful professional on desktop, not a team. Product decisions should optimize for individual flow before they optimize for coordination.

## UX Principles

### Start in motion

The app should open directly into the library and get out of the way. New notes should be easy to create and should not require choosing a notebook up front. Capture comes first. Notebook assignment can happen later without friction.

### Resume the last thread

On open, `comet` should feel like returning to the work you were already doing. Re-entry into the most recent note matters more than dashboarding.

### Structure should stay light

Use the smallest set of organizing primitives that can hold up daily use. In v1 that means `All Notes`, `Archive`, flat `Notebooks`, markdown-derived tags, and search. No nested notebooks. No overlapping systems such as folders, managed tags, and database properties.

### Links should be first-class, not loud

Linking is part of the product identity, but it should not dominate the writing surface. Links should be easy to create while typing, and backlinks should exist without constantly demanding attention.

### Markdown-first, still calm

Writing should stay close to the underlying markdown instead of hiding it behind a rich-text bridge. The editor should make markdown readable and pleasant to work in, without pretending it is something else.

### Publish should be explicit

Publishing is important, but it should remain a deliberate act. A note stays private by default and becomes public only when the user chooses `Publish`.

## Constraints

- `comet` is desktop-first in v1.
- `comet` is single-user in v1.
- Note content is stored locally in SQLite.
- Markdown is the underlying note format.
- Nostr identity should be part of the architecture from the start.
- Full cross-device sync and publishing can arrive in stages, but the app should not be architected like a dead-end single-device silo.
- Notebooks are flat only and provide context, not hard boundaries.
- Notes belong to at most one notebook.
- Search and calm retrieval matter more than deep hierarchy.

## Decision Filters

When evaluating a change, ask:

1. Does this help the user leave a better trail of thought over time?
2. Does this reduce friction in capture, writing, retrieval, or publishing?
3. Does this preserve calmness and legibility?
4. Does this strengthen trust through ownership, clarity, or reliability?
5. Is this a real need for v1, or borrowed complexity from a future product?

If the answer is weak on most of these, the change should wait.
