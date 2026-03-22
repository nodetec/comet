// Deprecated: this module has been decomposed into the hexagonal architecture.
//
// - domain/notes/model.rs    — types
// - domain/notes/service.rs  — business logic
// - domain/notes/error.rs    — error types
// - ports/note_repository.rs — repository trait
// - adapters/sqlite/note_repository.rs — SQLite implementation
// - commands/notes.rs        — Tauri command layer
// - infra/cache.rs           — rendered HTML cache
