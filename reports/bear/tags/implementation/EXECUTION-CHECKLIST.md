# Tag System Execution Checklist

Date: 2026-03-28

## Milestone 1

### Phase 1: Parser Contract

- [x] Replace the flat-tag extractor in `app/src-tauri/src/domain/common/text.rs`
- [x] Add canonical tag normalization helpers for direct tag paths
- [x] Add tag rendering helper for simple vs wrapped authored syntax
- [x] Expand Rust tests to cover the phase-1 fixture corpus
- [x] Update note creation defaults in `app/src-tauri/src/domain/notes/service.rs` to render valid wrapped tags when needed

### Phase 2: Data Model

- [x] Add `tags` and `note_tag_links` schema to `app/src-tauri/src/adapters/sqlite/migrations.rs`
- [x] Replace `note_tags` reads and writes in `app/src-tauri/src/adapters/sqlite/note_repository.rs`
- [x] Update `app/src-tauri/src/ports/note_repository.rs` for direct-tag reads and tree/tag metadata queries
- [x] Keep `LoadedNote.tags` as direct canonical paths only

### Phase 3: Migration

- [x] Add tag index migration state keys in `app_settings`
- [x] Implement shared `rebuild_tag_index` logic
- [x] Wire rebuild into startup/cutover path
- [x] Remove runtime dependency on `note_tags`
- [x] Update sync reset/bootstrap/test helpers to the new tables

### Phase 4: Editor

- [x] Replace the old recognizer in `app/src/features/editor/extensions/hashtag-extension.ts`
- [x] Replace the old completion logic in `app/src/features/editor/plugins/tag-completion-plugin.tsx`
- [x] Support wrapped tag insertion and entity dissolution rules
- [x] Add editor tests for simple, nested, wrapped, escaped, and invalid cases

## Milestone 2

### Phase 5: Sidebar/Search

- [x] Add tree-shaped contextual tag types to `app/src/shared/api/types.ts`
- [x] Change note queries to return structured tag trees
- [x] Replace flat sidebar chips with tree rendering
- [x] Rename shell state from `activeTags` to `activeTagPaths`
- [x] Update command palette tag behavior to navigate to tag views

### Phase 6: Management

- [x] Add parser-aware markdown rewrite utilities in Rust
- [x] Add tag management commands to `app/src-tauri/src/commands/notes.rs`
- [x] Implement rename/merge/delete/pin/hide-subtag-notes service flows
- [x] Add sidebar or command-palette actions for tag management

## Milestone 3

### Phase 7: Sync/Publish/Export

- [x] Update sync revision code to read direct canonical tags from the new index
- [x] Ensure sync apply rebuilds local derived links
- [x] Make publish dialogs default from direct canonical tags
- [x] Validate/canonicalize publish overrides
- [x] Add nested tag export behavior and richer export input types

### Phase 8: Hardening

- [x] Add migration/rebuild failure handling and repair entry points
- [x] Add observability around parse, rebuild, and rewrite failures
- [x] Add cross-layer parity tests for parser, editor, sync, publish, and export
- [x] Remove any remaining production references to the old flat-tag runtime

## Status Note

The only remaining `note_tags` references in the repository are in historical migration history and planning documents that describe the original starting state. Runtime code, repair tooling, seed/clear scripts, and production queries now use `tags` plus `note_tag_links`.
