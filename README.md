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

Project-specific commands are prefixed by workspace so app, relay, and blossom workflows stay separate.

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
- `just blossom-dev`: run the Blossom workspace in development
- `just blossom-deploy`: deploy the Blossom workspace to Fly
- `just blossom-build`: build the Blossom workspace
- `just blossom-lint`: run Blossom ESLint checks
- `just blossom-lint-fix`: run Blossom ESLint with fixes
- `just blossom-test`: run the Blossom test suite
- `just blossom-typecheck`: run TypeScript checks for the Blossom workspace
- `just blossom-check`: run the Blossom verification suite
- `just format`: format the repo
- `just format-check`: check formatting
- `just app-seed`: seed demo notebooks and notes
- `just outdated-crates`: check for Rust dependency updates

The seed script resets the local app database by default. To seed a throwaway database instead, pass `COMET_DB_PATH=/tmp/comet.db`.

## Repo Layout

- [`app`](/Users/chris/Repos/project/comet/app): the Comet app workspace
- [`app/src`](/Users/chris/Repos/project/comet/app/src): React frontend
- [`app/src-tauri`](/Users/chris/Repos/project/comet/app/src-tauri): Tauri + Rust backend
- [`blossom`](/Users/chris/Repos/project/comet/blossom): Bun-based Blossom server workspace
- [`relay`](/Users/chris/Repos/project/comet/relay): Bun-based Nostr relay workspace
- [`packages/data`](/Users/chris/Repos/project/comet/packages/data): shared Postgres schema and migrations
- [`packages/nostr`](/Users/chris/Repos/project/comet/packages/nostr): shared Nostr validation/auth helpers

## Workspace

- Root scripts use Turborepo for workspace tasks like `build`, `lint`, `typecheck`, and `test`
- The app source, Vite config, and Tauri project live in [`app`](/Users/chris/Repos/project/comet/app)

## Testing Notes

- `just app-test-frontend` runs the frontend test suite
- `just app-test-backend` runs the Rust test suite
- `just app-test` runs both

Relay and Blossom development use Bun. Install Bun if you plan to run commands under [`relay`](/Users/chris/Repos/project/comet/relay) or [`blossom`](/Users/chris/Repos/project/comet/blossom). The default app workflows such as `just app-build` and `just app-check` do not require Bun.

Relay and Blossom test suites use Postgres. Set `TEST_DATABASE_URL` or run a local `comet_test` database before `just relay-test` or `just blossom-test`.

Use a disposable local test database only. Relay and Blossom integration tests run migrations and truncate shared tables during setup, so do not point `TEST_DATABASE_URL` at a real app, staging, or production database.

### Local Postgres setup

One working local setup on macOS is:

```sh
brew install postgresql@16
brew services start postgresql@16
createdb comet_test
export TEST_DATABASE_URL=postgres://$USER@localhost:5432/comet_test
```

Then run:

```sh
just relay-test
just blossom-test
```

If you already have Postgres running, you usually only need:

```sh
createdb comet_test
export TEST_DATABASE_URL=postgres://$USER@localhost:5432/comet_test
```

## Git hooks

This repo uses Husky + lint-staged for a pre-commit hook on staged files. After `just install`, the hook is installed automatically via the `prepare` script.

On commit, staged files run through:

- `eslint --fix` and `prettier --write` for `*.ts` and `*.tsx`
- `prettier --write` for `*.js`, `*.mjs`, `*.cjs`, `*.json`, `*.md`, `*.yml`, and `*.yaml`
