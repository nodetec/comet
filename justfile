default:
  @just --list

install:
  npm install

dev:
  npm run tauri:dev

build:
  npm run build

typecheck:
  npm run typecheck

lint:
  npm run lint

lint-fix:
  npm run lint:fix

bundle:
  npm run tauri build -- --bundles app

test:
  npm test
  cargo test --manifest-path src-tauri/Cargo.toml

test-frontend:
  npm test

test-backend:
  cargo test --manifest-path src-tauri/Cargo.toml

format:
  npm run format

format-check:
  npm run format:check

seed:
  npm run seed:db

outdated-npm:
  -npm outdated

outdated-crates:
  cargo upgrade --dry-run --manifest-path src-tauri/Cargo.toml --incompatible allow

check: format-check lint typecheck test build
