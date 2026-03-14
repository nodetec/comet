# Roadmap

Maintenance rule: update this document when priorities or sequencing change, not for every task-level implementation detail.

## Now

Build the first complete trail-taking workflow on desktop.

- Turn the starter app into a real notes shell with sidebar, note list, editor, and search entry point
- Make the local SQLite note store the core source of truth, with markdown as the stored content format
- Support fast note creation, editing, and reopening the most recent note
- Establish the first organization model: `All Notes`, `Archive`, and flat `Notebooks`
- Add markdown-derived tags as lightweight filters without turning them into a separate management system
- Implement fast title and body search
- Add a real archive/delete flow with native-feeling desktop interactions
- Bake Nostr identity and sync-ready metadata into the architecture without requiring publishing or full sync completion yet

## Next

Make the product feel dependable after daily use starts.

- Improve note retrieval as the library grows
- Refine notebook management without adding hierarchy
- Add note-to-note linking with lightweight creation of linked notes
- Strengthen link workflows and linked-note discovery
- Add a simple publish flow that sends a note to Nostr as-is
- Make publishing status clearer, including visible published state and relay visibility
- Tighten persistence, startup, and editing reliability so the app feels trustworthy day after day
- Begin desktop-to-desktop sync in a way that preserves the local-first model

## Later

Expand the product only after the core loop is clearly strong.

- Improve sync across desktop devices
- Deepen publishing workflows where they clearly help users move from private note to public artifact
- Revisit richer editor capabilities if they improve writing quality without compromising portability
- Add stronger retrieval and resurfacing features if they help users reconnect ideas without adding heavy structure
- Explore a separate mobile experience after the desktop product has a stable identity

## Open Questions

- How rich should the editor become before it starts compromising the markdown storage and export story?
- Which Nostr publishing details should be visible in the main note view versus secondary UI?
- How much notebook sprawl is acceptable before the product needs stronger guardrails?
- What is the right first sync behavior to ship without weakening trust?

## Roadmap Intent

This roadmap is directional, not a backlog. The sequencing principle is simple: prove that `comet` is the best place to leave a trail on desktop before broadening the product surface.
