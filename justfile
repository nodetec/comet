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

app-seed:
  pnpm --filter @comet/app seed:db

app-check:
  just format-check
  just app-lint
  just app-typecheck
  just app-test
  just app-build

relay-dev:
  pnpm --filter @comet/relay dev

relay-deploy:
  flyctl deploy --config relay/fly.toml --remote-only

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
  just relay-lint
  just relay-typecheck
  just relay-build
  just relay-test

blossom-dev:
  pnpm --filter @comet/blossom dev

blossom-deploy:
  flyctl deploy --config blossom/fly.toml --remote-only

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
  just blossom-lint
  just blossom-typecheck
  just blossom-build
  just blossom-test

web-dev:
  pnpm --filter @comet/web dev

web-deploy:
  flyctl deploy --config web/fly.toml --remote-only

web-build:
  pnpm --filter @comet/web build

web-lint:
  pnpm --filter @comet/web lint

web-lint-fix:
  pnpm --filter @comet/web lint:fix

web-typecheck:
  pnpm --filter @comet/web typecheck

web-check:
  just web-lint
  just web-typecheck
  just web-build

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
  -pnpm outdated

outdated-crates:
  cargo upgrade --dry-run --manifest-path app/src-tauri/Cargo.toml --incompatible allow
