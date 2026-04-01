# App

Desktop notes app.

## Principles

- **Single responsibility**: every module, struct, and function does one thing.
- **Dependency inversion**: depend on abstractions (traits), not implementations.
- **Composition over inheritance**: build behavior by combining small pieces, not extending base types.
- **Fail fast**: surface errors early, never swallow them silently.

## Editor Invariants

- The editor is **markdown-first**. Stored note markdown is the canonical representation for note content.
- Lexical AST, rendered HTML, clipboard payloads, and sync payloads are derived representations and must not introduce content drift.
- Supported content should round-trip stably across save/load, sync, copy/paste, and import/export flows.
- Preserve authored structure where possible. Do not silently reformat or normalize content unless the normalization is intentional, documented, and stable after one pass.
- Any bug caused by representation drift should get a regression test at the seam where it occurred.

Reference: `app/docs/editor-invariants.md`

## Stack

- **Frontend**: React 19, Vite, Tailwind 4, shadcn/ui, Lexical editor
- **Backend**: Tauri 2 (Rust), SQLite via rusqlite
- **State**: TanStack Query, Zustand
- **Sync**: Nostr protocol via nostr-sdk

## Naming

### Rust

- Types/structs: `PascalCase`
- Functions/variables: `snake_case`
- Constants: `SCREAMING_SNAKE_CASE`
- Modules: `snake_case`
- Tauri commands: `snake_case`

### React/TypeScript

- Components: `PascalCase` (file and export)
- Hooks: `useCamelCase`
- Utils/functions: `camelCase`
- Types: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Files: `kebab-case` (except components, which are `PascalCase.tsx`)
- Query keys: flat arrays, plural root. `["notes"]` for lists, `["notes", id]` for items. Invalidation cascades via prefix matching.

## Database

SQLite via rusqlite. Single migration file in `db.rs`.

- Tables: singular, snake_case
- Columns: snake_case
- IDs: TEXT
- Timestamps: INTEGER (milliseconds)
- Booleans: INTEGER (0/1) with CHECK constraint
- Indexes: `idx_{table}_{columns}`
- Foreign keys: always define with explicit ON DELETE behavior
- NOT NULL by default, only nullable when meaningful (e.g. `archived_at`)
- Always index foreign key columns

## Architecture

### Backend (Rust)

Hexagonal architecture. Three layers:

- **Domain**: core types, business logic, and port traits. No dependencies on frameworks, databases, or external services.
- **Adapters**: implementations of port traits (SQLite, Nostr relay, Blossom, filesystem). Depend on domain, never on each other.
- **Commands**: thin Tauri command handlers. Wire adapters to domain, handle serialization. No business logic.

Dependencies flow inward: commands → adapters → domain. Domain depends on nothing.

### Frontend (React)

Feature-Sliced Design. Organize by feature, not by technical role. Each feature owns its own components, hooks, API calls, and types. Shared code lives in a common layer.

## Error Handling

### Backend (Rust)

- **Domain errors**: each domain module defines its own error enum for business logic failures (e.g. `NoteError::NotFound`, `SyncError::Conflict`). No framework dependencies.
- **Adapter errors**: adapters map infrastructure failures (SQLite, network, filesystem) into domain errors at the boundary.
- **Command errors**: the Tauri command layer maps domain errors into structured IPC responses with a code and message.

Errors flow outward: adapter errors → domain errors → IPC response. Domain never sees infrastructure error types.

### IPC Boundary

Errors cross IPC as structured objects: `{ code: string, message: string }`. The frontend can branch on `code` for different behavior (retry, redirect, toast severity).

### Frontend

Use `code` for control flow, `message` for display. Centralize error handling through React Query's `onError` callbacks with toast notifications as the default.

## State Management

- **TanStack Query**: all server state. Anything from `invoke()` goes through query or mutation hooks.
- **Zustand**: client-only UI state. One store per feature (e.g. editor, sidebar). Shared state that spans features (e.g. current account, theme) lives in the common layer.

Derive state from queries when possible — don't duplicate server data into Zustand.

## Testing

Test behavior, not implementation. If refactoring internals breaks tests, the tests are too coupled.

### Backend (Rust)

- **Domain**: unit tests for business logic. Fast, no database or network. Mock ports via traits.
- **Adapters**: integration tests against real dependencies (SQLite in-memory, etc.)
- **Commands**: thin enough that domain + adapter coverage is sufficient. Light smoke tests at most.

### Frontend (React)

- **Hooks/logic**: unit tests with Vitest for query/mutation wrappers and Zustand stores.
- **Components**: component tests with Testing Library for interaction-heavy UI. Skip tests for purely presentational components.

## Coverage

- **Frontend**: `pnpm test --coverage`
- **Backend**: `cargo tarpaulin` (from `app/src-tauri`)

## Types

Rust is the source of truth. Use specta to generate TypeScript types from Rust structs — do not manually maintain TypeScript type mirrors.
