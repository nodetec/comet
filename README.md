# comet

Comet is a local-first notes app built with Tauri, React, TypeScript, and Rust.

- Local-first note-taking
- Encrypted sync with Nostr
- Encrypted blob storage with Blossom
- Turborepo monorepo with the app in `app/`

## Quick Start

1. Install `just`: `brew install just` or `cargo install just`
2. Install dependencies: `just install`
3. Start the app: `just app-dev`

## Commands

Project-specific commands are prefixed by workspace so app and relay workflows stay separate.

- `just app-dev`: run the app in development mode
- `just app-build`: build the app frontend workspace
- `just app-bundle`: build the packaged Tauri app
- `just app-lint`: run app ESLint checks
- `just app-lint-fix`: run app ESLint with fixes
- `just app-typecheck`: run app TypeScript checks
- `just app-test`: run frontend and Rust tests for the app
- `just app-test-backend`: run the Rust test suite
- `just app-test-frontend`: run the frontend test suite
- `just app-check`: run the main app verification suite
- `just relay-dev`: run the relay workspace in development
- `just relay-deploy`: deploy the relay to Fly
- `just relay-build`: build the relay workspace
- `just relay-lint`: run relay ESLint checks
- `just relay-lint-fix`: run relay ESLint with fixes
- `just relay-test`: run the relay test suite
- `just relay-typecheck`: run TypeScript checks for the relay workspace
- `just relay-check`: run the relay verification suite
- `just format`: format the repo
- `just format-check`: check formatting
- `just app-seed`: seed demo notebooks and notes
- `just outdated-crates`: check for Rust dependency updates

The seed script resets the local app database by default. To seed a throwaway database instead, pass `COMET_DB_PATH=/tmp/comet.db`.

## Repo Layout

- [`app`](/Users/chris/Repos/project/comet/app): the Comet app workspace
- [`app/src`](/Users/chris/Repos/project/comet/app/src): React frontend
- [`app/src-tauri`](/Users/chris/Repos/project/comet/app/src-tauri): Tauri + Rust backend
- [`relay`](/Users/chris/Repos/project/comet/relay): Bun-based Nostr relay workspace
- [`packages`](/Users/chris/Repos/project/comet/packages): shared packages when needed

## Workspace

- Root scripts use Turborepo for workspace tasks like `build`, `lint`, `typecheck`, and `test`
- The app source, Vite config, and Tauri project live in [`app`](/Users/chris/Repos/project/comet/app)

## Testing Notes

- `just app-test-frontend` runs the frontend test suite
- `just app-test-backend` runs the Rust test suite
- `just app-test` runs both

Relay development uses Bun. Install Bun if you plan to run commands under [`relay`](/Users/chris/Repos/project/comet/relay). The default app workflows such as `just app-build` and `just app-check` do not require Bun.

## Git hooks

This repo uses Husky + lint-staged for a pre-commit hook on staged files. After `just install`, the hook is installed automatically via the `prepare` script.

On commit, staged files run through:

- `eslint --fix` and `prettier --write` for `*.ts` and `*.tsx`
- `prettier --write` for `*.js`, `*.mjs`, `*.cjs`, `*.json`, `*.md`, `*.yml`, and `*.yaml`
