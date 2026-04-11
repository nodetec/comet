# AGENTS

## Projects

- **app/** — Desktop notes app (Tauri 2 + React 19 + CodeMirror)
- **relay/** — Nostr sync relay
- **blossom/** — Blossom blob storage server
- **web/** — Web app: admin portal and browser-based notes client
- **www/** — Marketing site
- **mcp/** — MCP server
- **packages/data/** — Shared database schema and migrations
- **packages/nostr/** — Shared Nostr utilities and types
- **docs/** — Development docs and product context

## Defaults

- Treat the project as greenfield. Prefer clean solutions over compatibility layers, migration hacks, or legacy-preserving abstractions.
- Do not carry forward temporary transition logic once a cleaner baseline can replace it.

## App

Desktop notes app: Tauri 2 + React 19 + CodeMirror.

### Structure

```
src/
├── features/
│   ├── command-palette/   # Command palette (Cmd+K)
│   ├── editor/            # CodeMirror editor, extensions, toolbar
│   ├── editor-pane/       # Editor pane layout, find bar, scroll header
│   ├── notes-pane/        # Notes list, filtering, note row
│   ├── publishing/        # Nostr publishing dialogs
│   ├── settings/          # Settings dialogs, UI store, theme
│   ├── shell/             # App orchestration, shell store, draft/sync/conflict hooks
│   ├── sidebar-pane/      # Sidebar layout, tag tree, navigation
│   └── sync/              # Sync dialog
└── shared/
    ├── api/               # Tauri IPC invoke wrappers
    ├── config/            # React Query setup
    ├── hooks/             # Shared hooks
    ├── lib/               # Shared utilities
    └── ui/                # shadcn components
```

Each feature follows this structure:

```
<feature>/
├── ui/        # Components
├── hooks/     # Custom hooks
├── store/     # Zustand stores
├── lib/       # Utilities
└── index.ts   # Barrel exports (public API)
```

### Conventions

- **Imports**: Always use `@/` path alias, never relative imports.
- **Styling**: Tailwind v4 with CSS variables (oklch). Shadcn + CVA for component variants. Oxfmt auto-sorts Tailwind classes.
- **State**: Zustand for app/UI state, React Query for server state. No Redux or Context for state management.
- **Tauri IPC**: All backend calls go through typed `invoke()` wrappers in `shared/api/invoke.ts`.
- **Naming**: Components `PascalCase` exports in `kebab-case.tsx` files, hooks `use-*.ts`, stores `use-*-store.ts`, utilities `lowercase.ts`.
- **Testing**: Vitest, unit tests only (`*.test.ts`), colocated with implementation. Tests cover logic (search, markdown, etc.), not components.
- **No routing**: Single-page desktop app. Navigation is store-driven (`selectedNoteId`, `activeNotebookId`).
- **CodeMirror editor**: Extensions in `features/editor/extensions/`. Markdown-first with syntax highlighting, autocomplete, and inline images.
- **Linting**: Oxlint (not ESLint). `@tanstack/eslint-plugin-query` rules are not yet available — revisit when oxlint JS plugins stabilize.
