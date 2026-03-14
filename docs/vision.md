# Vision

Maintenance rule: update this document when the product direction changes, not when implementation details change.

## Overview

`comet` is a desktop notes app for the thoughtful professional. It should be the best place to leave a trail: a trail of thoughts over time that starts as private writing, stays easy to revisit, and can become public when the user chooses.

The app should feel fast, native, calm, and trustworthy. It should help people write without asking them to become librarians of their own ideas.

## Target User

The reference user is a thoughtful professional: someone whose work depends on collecting, shaping, and returning to ideas. They may be a writer, journalist, operator, founder, or researcher, but the common trait is the same. They think in text, they revisit unfinished thoughts often, and they want a notes app that feels beautiful and dependable instead of busy or overbuilt.

## Problem

Most note tools break down in one of two ways. They either stay simple but become messy, or they become powerful by asking the user to manage systems, structure, and product surface area that has little to do with thinking.

That creates three failures:

- capture is slower than it should be
- resuming context is harder than it should be
- publishing or syncing ideas requires leaving the core note workflow

## Product Promise

`Comet is the best place to leave a trail.`

In product terms, that means:

- thoughts should be easy to capture
- the most recent thread should be easy to resume
- notes should stay readable, local, and exportable
- any note can become a published note with one explicit action later, once the publishing flow is in place

## Product Stance

`comet` is not trying to be a workspace suite, team wiki, or general productivity operating system. It is a text-first notes product with a clear point of view.

That point of view is:

- notes live locally in a database, with markdown as the note format
- the editor is markdown-first and source-visible, but still styled to feel calm and readable
- the default organization model is light
- links matter more than hierarchy
- Nostr matters as the publishing and sync identity layer

## Differentiators

- Beautiful by default. Typography, spacing, and calmness are part of the product value, not polish added later.
- Local and durable. Notes live on the device, use markdown as the content format, and should stay straightforward to export or back up.
- Low-ceremony structure. Users can keep notes loose by default, use flat notebooks for context, and rely on links, search, and recency instead of deep filing systems.
- Markdown-native tags. Tags are created by writing `#tag` in note content, then reused as lightweight filters instead of a separate management system.
- Trail over archive. The app should help users see where their thinking has been, not just store documents.
- Private to public path. A note begins as a private document and can be published to Nostr directly from the app.

## v1 Shape

V1 should prove a narrow but real workflow:

- local notes backed by SQLite, with markdown as the stored content format
- fast note creation and editing
- a note list sorted by last edited
- fast title and body search
- flat notebooks, markdown-derived tags, and an archive flow
- native-feeling desktop shell behavior
- Nostr identity and sync architecture designed in from the start, even if publishing and full multi-device sync are still partial

## Information Model

The product should stay simple by default.

- `All Notes` exists.
- New notes are created into the general note pool and appear in `All Notes`.
- `Archive` is a system section for notes moved out of the main library.
- User-created `Notebooks` are flat only. No nesting.
- Tags are derived from `#tag` text inside notes and used as lightweight filters.
- A note belongs to at most one notebook.
- Notes can remain outside notebooks.
- Archive is separate from notebook organization.

This is enough structure to provide context without turning the app into a filing system.

The storage model is deliberately separate from the writing model. Users write markdown-backed notes. The app stores them in a local database so sync, identity, and metadata stay coherent without leaking structure into the note body.

## Not Yet

- Publishing UI
- Note-to-note links and backlinks
- Collaboration
- Plugins
- Mobile app
- Web app
- Team workspace features
- Database-style properties and over-structured note systems
- Deep notebook hierarchies
- Graph views as product theater

## What Success Looks Like

Within the first six months, the right user should say: I capture notes here, I come back here first, I can publish from here, and I trust this app enough to keep a real trail of my thinking inside it.
