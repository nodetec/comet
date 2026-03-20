# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Comet

Comet is a desktop notes app built with **Tauri 2** (Rust backend) + **React 19** (TypeScript frontend). Single-user, local-first, markdown-native. Notes are stored as markdown in SQLite. The editor is built on Lexical.

The `AGENTS.md` file has hard repo defaults for builders.

## Commands

```bash
corepack enable                      # One-time: expose pnpm from Corepack if needed
pnpm install                         # Install dependencies
pnpm tauri:dev                       # Start app in dev mode (separate DB from production)
pnpm bundle                          # Production app bundle
pnpm typecheck                       # Frontend only: TypeScript check
pnpm build                           # Frontend workspace build via Turbo
pnpm lint                            # ESLint (React + TypeScript + TanStack Query)
pnpm format                          # Prettier (with tailwindcss plugin)
pnpm format:check                    # Check formatting without modifying
pnpm seed:db                         # Seed demo data (resets local DB by default)
```

## Architecture

### Data Flow

```
React UI → useShellController (React Query + Tauri invoke()) → Rust commands (lib.rs) → SQLite
```

### Frontend (`app/src/`)

- **App.tsx**: Root 3-pane resizable layout (sidebar | notes list | editor) using `@column-resizer/react`
- **features/shell/**: Main app shell — `sidebar-pane`, `notes-pane`, `editor-pane`, and `use-shell-controller.ts` (central orchestration hub, ~1000 lines, handles all Tauri invocations + React Query mutations)
- **features/settings/**: Settings dialog with general + editor tabs
- **components/editor/**: Lexical-based markdown editor
  - `lib/markdown.ts`: Custom import/export preserving empty paragraphs
  - `plugins/`: ~13 Lexical plugins (toolbar, code highlight, link paste, images, YouTube, etc.)
  - `nodes/`: Custom Lexical nodes (image, YouTube)
  - `transformers/`: Markdown ↔ Lexical AST transformers
- **components/ui/**: shadcn/ui primitives
- **stores/**: Zustand stores
  - `use-shell-store.ts`: Transient UI state (active filter, search, selected note, draft)
  - `use-ui-store.ts`: Persisted UI state via localStorage (font size, sort prefs, toolbar visibility)

### Backend (`app/src-tauri/src/`)

- **lib.rs**: Tauri command exports (the IPC surface)
- **notes.rs**: Core note/notebook CRUD, queries, tagging (~1300 lines)
- **db.rs**: SQLite schema, migrations, FTS setup
- **attachments.rs**: Image attachment handling

### State Management Split

- **Zustand** (`useShellStore`, `useUIStore`): Client-side transient and persisted state
- **TanStack React Query**: Server state (notes lists, notebooks, note details, mutations with optimistic updates)

### Key Patterns

- Tags are dynamically extracted from `#tag` syntax in markdown content — no separate tag management
- Notes belong to at most one notebook; notebooks are flat (no nesting)
- Archive is soft-delete; permanent delete is separate
- App resumes the last-opened note on startup
- Infinite scroll for note lists (40-note pages)
- Path alias: `@/*` maps to `./src/*`

## Product Constraints (from AGENTS.md)

- v1 is desktop-first
- No collaboration, plugin system, or mobile in v1
- No nested notebooks, graph-view, or overlapping organization systems
- Prefer clean greenfield solutions over compatibility layers or migration hacks
- Nostr SDK is included for future publishing — architecture should preserve that path

## Commit Style

- Do not include `Co-Authored-By` lines in commit messages
