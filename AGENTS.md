# AGENTS

## Mission

Build `comet` as a desktop notes app for the thoughtful professional.

The product promise is simple: `Comet is the best place to leave a trail.` Build toward a calm, native-feeling, text-first notes app that helps users capture thoughts, resume context, connect notes, and publish when they choose.

## Read First

Before making product or UX decisions, read these files:

- `docs/vision.md`
- `docs/principles.md`
- `docs/roadmap.md`

These are the source of truth for product direction. `AGENTS.md` exists to turn that direction into hard repo defaults for builders.

## Product Defaults

- Treat v1 as desktop-first and single-user.
- Notes are stored locally in SQLite, with markdown as the content format.
- The editor should be markdown-first, source-visible, and calm rather than rich-text-first.
- Prioritize fast capture, fast resume, and calm retrieval over feature breadth.
- Search is fast title/body search.
- Links are first-class and ignore notebook boundaries.
- Any note can be published to Nostr with one explicit action.
- Nostr identity and sync-readiness are part of the architecture from the start, even if full sync ships later.

## Architecture Defaults

- Treat the project as greenfield unless the user explicitly says otherwise.
- Prefer the clean greenfield solution over compatibility layers, rescue paths, migration hacks, or legacy-preserving abstractions.
- Do not carry forward temporary transition logic once a cleaner baseline can replace it.
- SQLite is the primary note store.
- Markdown remains the note content format inside the database.
- Keep note data local and straightforward to export or back up.
- Do not reintroduce split-brain storage between primary files and a primary database.
- Preserve a clear path for desktop-to-desktop sync later without making v1 depend on full sync to be useful.

## V1 UI / IA Defaults

- Preserve the default shell: sidebar, note list, editor, and search entry point.
- Opening the app should bias toward resuming the note the user was last working in.
- New notes appear in `All Notes`.
- `Archive` is the system section for notes removed from the main library.
- User-created `Notebooks` are flat only. No nesting.
- Tags are derived from `#tag` text in notes and used as lightweight filters.
- A note belongs to at most one notebook.
- Notes may exist without a notebook.
- Notebook views show notes assigned to that notebook only.
- Keep structure light. Favor `All Notes`, `Archive`, `Notebooks`, and search over extra systems.

## Avoid

- Do not add collaboration features in v1.
- Do not add a plugin system in v1.
- Do not build mobile app features in this repo’s v1.
- Do not build web app features in this repo’s v1.
- Do not introduce nested notebooks.
- Do not add overlapping organization systems such as folders plus managed tags plus database properties.
- Do not add graph-view or “second-brain theater” features unless product direction changes explicitly.
- Do not introduce speculative abstractions or platform layers before the core notes workflow is solid.

## Workflow

- Preferred commands:
  - `npm install`
  - `npm run tauri dev`
  - `npm run build`
  - `npm run tauri build -- --bundles app`
- Verify the specific area you change.
- Prefer small, product-aligned changes over broad refactors.
- Avoid editing generated or dependency directories such as `node_modules/`, `dist/`, and `src-tauri/target/`.
- If a change would alter product behavior or information architecture, update the relevant docs with it.
