default:
  @just --list

install:
  pnpm install

dev:
  pnpm tauri:dev

build:
  pnpm build

typecheck:
  pnpm typecheck

lint:
  pnpm lint

lint-fix:
  pnpm lint:fix

bundle:
  pnpm bundle

test:
  pnpm test
  cargo test --manifest-path app/src-tauri/Cargo.toml

test-frontend:
  pnpm test

test-backend:
  cargo test --manifest-path app/src-tauri/Cargo.toml

format:
  pnpm format

format-check:
  pnpm format:check

seed:
  pnpm seed:db

outdated-js:
  -pnpm outdated

outdated-crates:
  cargo upgrade --dry-run --manifest-path app/src-tauri/Cargo.toml --incompatible allow

check: format-check lint typecheck test build
