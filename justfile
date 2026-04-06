default:
  @just --list

install:
  pnpm install

app-dev:
  pnpm --filter @comet/app tauri:dev

app-build:
  pnpm --filter @comet/app build

app-typecheck:
  pnpm --filter @comet/app typecheck

app-lint:
  pnpm --filter @comet/app lint

app-lint-fix:
  pnpm --filter @comet/app lint:fix

app-bundle:
  pnpm --filter @comet/app tauri build --bundles app

app-test:
  pnpm --filter @comet/app test
  cargo test --manifest-path app/src-tauri/Cargo.toml

app-test-frontend:
  pnpm --filter @comet/app test

app-test-backend:
  cargo test --manifest-path app/src-tauri/Cargo.toml

app-coverage-frontend:
  pnpm --filter @comet/app test --coverage

app-coverage-backend:
  cargo tarpaulin --manifest-path app/src-tauri/Cargo.toml

app-coverage:
  just app-coverage-frontend
  just app-coverage-backend

app-clippy:
  cargo clippy --manifest-path app/src-tauri/Cargo.toml

app-seed:
  pnpm --filter @comet/app seed:db

app-seed-account:
  pnpm --filter @comet/app seed:db -- --account-only

app-check:
  pnpm format:check
  pnpm exec turbo run lint typecheck test build --filter=@comet/app
  cargo test --manifest-path app/src-tauri/Cargo.toml

relay-dev:
  pnpm --filter @comet/relay dev

relay-db-create db_name="relay":
  createdb {{db_name}}

relay-db-drop db_name="relay":
  dropdb {{db_name}}

relay-db-reset db_name="relay":
  -dropdb {{db_name}}
  createdb {{db_name}}

relay-dev-multi count="3" start_port="3400":
  pnpm --filter @comet/relay dev:multi -- --count {{count}} --start-port {{start_port}}

relay-build:
  pnpm --filter @comet/relay build

relay-lint:
  pnpm --filter @comet/relay lint

relay-lint-fix:
  pnpm --filter @comet/relay lint:fix

relay-test:
  pnpm --filter @comet/relay test

relay-typecheck:
  pnpm --filter @comet/relay typecheck

relay-check:
  pnpm exec turbo run lint typecheck build test --filter=@comet/relay

blossom-dev:
  pnpm --filter @comet/blossom dev

blossom-build:
  pnpm --filter @comet/blossom build

blossom-lint:
  pnpm --filter @comet/blossom lint

blossom-lint-fix:
  pnpm --filter @comet/blossom lint:fix

blossom-test:
  pnpm --filter @comet/blossom test

blossom-typecheck:
  pnpm --filter @comet/blossom typecheck

blossom-check:
  pnpm exec turbo run lint typecheck build test --filter=@comet/blossom

docs-dev:
  pnpm --filter @comet/docs dev

docs-build:
  pnpm --filter @comet/docs build

docs-preview:
  pnpm --filter @comet/docs preview

docs-typecheck:
  pnpm --filter @comet/docs typecheck

docs-deploy:
  pnpm --filter @comet/docs run deploy

docs-deploy-preview:
  pnpm --filter @comet/docs run deploy:preview

docs-check:
  pnpm exec turbo run typecheck build --filter=@comet/docs

web-dev:
  pnpm --filter @comet/web dev

web-build:
  pnpm --filter @comet/web build

web-lint:
  pnpm --filter @comet/web lint

web-lint-fix:
  pnpm --filter @comet/web lint:fix

web-typecheck:
  pnpm --filter @comet/web typecheck

web-check:
  pnpm exec turbo run lint typecheck build --filter=@comet/web

www-dev:
  pnpm --filter @comet/www dev

www-build:
  pnpm --filter @comet/www build

www-preview:
  pnpm --filter @comet/www preview

www-deploy:
  pnpm --filter @comet/www run deploy

www-deploy-preview:
  pnpm --filter @comet/www run deploy:preview

format:
  pnpm format

format-check:
  pnpm format:check

outdated-js:
  -pnpm outdated -r

outdated-crates:
  cargo upgrade --dry-run --manifest-path app/src-tauri/Cargo.toml --incompatible allow
