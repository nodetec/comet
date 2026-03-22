---
title: Foundation
description: Mission, defaults, and scope boundaries that should guide Comet changes.
---

## Mission

Comet is the best place to leave a trail.

Build toward a calm, native-feeling, text-first notes app that helps users
capture thoughts, resume context, connect notes, and publish when they choose.

## Product defaults

- Treat v1 as desktop-first.
- Store notes locally in SQLite.
- Keep markdown as the note content format.
- Prioritize fast capture, fast resume, and calm retrieval over breadth.
- Make links first-class across the whole library.
- Let any note publish to Nostr with one explicit action.

## Architecture defaults

- Prefer the clean greenfield solution over compatibility layers.
- Keep SQLite as the primary note store.
- Avoid split-brain storage between files and a primary database.
- Preserve a clear path for desktop-to-desktop sync later without making v1
  depend on full sync to be useful.

## V1 structure

- Preserve the default shell: sidebar, note list, editor, and search.
- Bias app launch toward the last active note.
- Put new notes in `All Notes`.
- Use `Archive` for notes removed from the main library.
- Keep notebooks flat.
- Derive tags from `#tag` text inside notes.
- Allow a note to belong to at most one notebook.
- Allow a note to be marked read-only without moving it out of the main library.

## Avoid

- Collaboration features in v1.
- Plugin systems in v1.
- Mobile app work in this repo's v1.
- Nested notebooks.
- Overlapping organization systems.
- Graph-view or second-brain theater features.
- Speculative abstractions before the core notes workflow is solid.
