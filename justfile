default:
  @just --list

install:
  npm install

dev:
  npm run tauri:dev

build:
  npm run build

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

check: format-check test build
