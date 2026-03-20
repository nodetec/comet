# Blossom

Comet Blossom is a Bun-based media server for Nostr Blossom uploads.

## Commands

- `just blossom-dev`
- `just blossom-build`
- `just blossom-test`
- `just blossom-typecheck`
- `just blossom-lint`
- `just blossom-deploy`

## Service Boundary

- Blossom owns blob metadata, blob ownership, storage accounting, and object-storage writes/deletes.
- The admin, landing, and dashboard extraction comes next. Those services should consume Blossom for blob operations instead of reaching into blob tables or object storage directly.
- `packages/data` owns the shared Postgres schema and migrations. Blossom reads shared tables, but it does not own invite or allowlist policy.

## Required Environment

- `DATABASE_URL`: Postgres connection string
- `S3_BUCKET`, `AWS_BUCKET`, or `BUCKET_NAME`: object storage bucket name
- `BLOSSOM_PUBLIC_URL` or `BUCKET_PUBLIC_URL`: optional public base URL for returned blob URLs
- `TEST_DATABASE_URL`: Postgres connection string used by the integration test suite

## Object Storage

Blossom uses Bun's native `S3Client` with S3-compatible storage.

Optional storage configuration:

- `S3_ENDPOINT` or `AWS_ENDPOINT_URL_S3`
- `S3_REGION` or `AWS_REGION`
- `S3_ACCESS_KEY_ID` or `AWS_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY` or `AWS_SECRET_ACCESS_KEY`
- `S3_SESSION_TOKEN` or `AWS_SESSION_TOKEN`
- `S3_VIRTUAL_HOSTED_STYLE=true` for virtual-hosted buckets

## Notes

- Blob metadata and ownership live in Postgres.
- Blob bytes live in S3-compatible object storage.
- The shared schema and migrations live in [`packages/data`](/Users/chris/Repos/project/comet/packages/data).
- Tests use a fake in-memory object storage implementation, so only Postgres is required to run [`just blossom-test`](/Users/chris/Repos/project/comet/justfile).
- `TEST_DATABASE_URL` must point to a disposable test database. The integration suite runs migrations and truncates shared tables during setup.

## Local test setup

One working local setup on macOS is:

```sh
brew install postgresql@16
brew services start postgresql@16
createdb comet_test
export TEST_DATABASE_URL=postgres://$USER@localhost:5432/comet_test
just blossom-test
```

If Postgres is already running, you usually only need `createdb comet_test` plus the `TEST_DATABASE_URL` export.

## Fly.io

- [`fly.toml`](/Users/chris/Repos/project/comet/blossom/fly.toml) is the starting Fly config for the Blossom workspace.
- [`Dockerfile`](/Users/chris/Repos/project/comet/blossom/Dockerfile) builds Blossom from the monorepo root using the checked-in [`pnpm-lock.yaml`](/Users/chris/Repos/project/comet/pnpm-lock.yaml).
- [`.github/workflows/ci.yml`](/Users/chris/Repos/project/comet/.github/workflows/ci.yml) deploys Blossom on pushes to `master` after CI passes when Blossom runtime or deploy files change.
- Set `DATABASE_URL` as a Fly app secret before deploy. Do not store it in GitHub Actions.
- Set `S3_BUCKET` plus any required S3 credentials on the Fly app before deploy.
- Add `FLY_API_TOKEN` to the GitHub repository secrets before enabling deploys.

### First-time setup

1. Create the Fly app and update [`fly.toml`](/Users/chris/Repos/project/comet/blossom/fly.toml) if `app = "comet-blossom"` is not the final app name.
2. Set the database secret on Fly so the running Blossom service has it at runtime:
   `fly secrets set DATABASE_URL=postgres://... --app <your-fly-app>`
3. Set the bucket name and any required S3 credentials on the Fly app.
4. Optionally set `BLOSSOM_PUBLIC_URL` on Fly if you want returned blob URLs to use a custom public hostname instead of the bucket URL.
5. Add `FLY_API_TOKEN` to the GitHub repository secrets so [`.github/workflows/ci.yml`](/Users/chris/Repos/project/comet/.github/workflows/ci.yml) can deploy Blossom.
6. Run the first deploy manually:
   `flyctl deploy --config blossom/fly.toml --remote-only`
