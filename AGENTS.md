# AGENTS

## Projects

- **app/** — Desktop notes app (Tauri 2 + React 19 + Lexical)
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

Desktop notes app: Tauri 2 + React 19 + Lexical.

### Structure

```
src/
├── features/          # Feature modules (editor, notes, settings, etc.)
│   └── <feature>/
│       ├── ui/        # Components
│       ├── hooks/     # Custom hooks
│       ├── store/     # Zustand stores
│       ├── lib/       # Utilities
│       └── index.ts   # Barrel exports (public API)
└── shared/
    ├── api/           # Tauri IPC invoke wrappers
    ├── config/        # React Query setup
    ├── hooks/         # Shared hooks
    ├── lib/           # Shared utilities
    └── ui/            # shadcn components
```

### Conventions

- **Imports**: Always use `@/` path alias, never relative imports.
- **Styling**: Tailwind v4 with CSS variables (oklch). Shadcn + CVA for component variants. Prettier auto-sorts Tailwind classes.
- **State**: Zustand for app/UI state, React Query for server state. No Redux or Context for state management.
- **Tauri IPC**: All backend calls go through typed `invoke()` wrappers in `shared/api/invoke.ts`.
- **Naming**: Components `PascalCase.tsx`, hooks `use-*.ts`, stores `use-*-store.ts`, utilities `lowercase.ts`.
- **Testing**: Vitest, unit tests only (`*.test.ts`), colocated with implementation. Tests cover logic (search, markdown, etc.), not components.
- **No routing**: Single-page desktop app. Navigation is store-driven (`selectedNoteId`, `activeNotebookId`).
- **Lexical editor**: Custom plugins in `features/editor/`. Theme maps Lexical nodes to Tailwind classes in `theme.ts`.
