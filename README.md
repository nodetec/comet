# comet

Comet is a local-first notes app built with Tauri, React, TypeScript, and Rust.

- Local-first note-taking
- Encrypted sync with Nostr
- Encrypted blob storage with Blossom
- Turborepo monorepo with the app in `app/`

## Quick Start

1. Install `just`: `brew install just` or `cargo install just`
2. Install dependencies: `just install`
3. Start the app: `just dev`

## Commands

- `just dev`: run the app in development mode
- `just build`: build the frontend workspace
- `just bundle`: build the packaged Tauri app
- `just lint`: run ESLint
- `just lint-fix`: run ESLint with fixes
- `just typecheck`: run TypeScript checks
- `just test`: run frontend and Rust tests
- `just test-backend`: run the Rust test suite
- `just format`: format the repo
- `just format-check`: check formatting
- `just seed`: seed demo notebooks and notes
- `just outdated-crates`: check for Rust dependency updates
- `just check`: run the main verification suite

The seed script resets the local app database by default. To seed a throwaway database instead, pass `COMET_DB_PATH=/tmp/comet.db`.

## Repo Layout

- [`app`](/Users/chris/Repos/project/comet/app): the Comet app workspace
- [`app/src`](/Users/chris/Repos/project/comet/app/src): React frontend
- [`app/src-tauri`](/Users/chris/Repos/project/comet/app/src-tauri): Tauri + Rust backend
- [`packages`](/Users/chris/Repos/project/comet/packages): shared packages when needed

## Workspace

- Root scripts use Turborepo for workspace tasks like `build`, `lint`, `typecheck`, and `test`
- The app source, Vite config, and Tauri project live in [`app`](/Users/chris/Repos/project/comet/app)

## Testing Notes

- `just test-frontend` runs the frontend test suite
- `just test-backend` runs the Rust test suite
- `just test` runs both

## Git hooks

This repo uses Husky + lint-staged for a pre-commit hook on staged files. After `just install`, the hook is installed automatically via the `prepare` script.

On commit, staged files run through:

- `eslint --fix` and `prettier --write` for `*.ts` and `*.tsx`
- `prettier --write` for `*.js`, `*.mjs`, `*.cjs`, `*.json`, `*.md`, `*.yml`, and `*.yaml`
