# Blossom

Comet Blossom is a Bun-based media server for Nostr Blossom uploads.

## Commands

- `just blossom-dev`
- `just blossom-build`
- `just blossom-test`
- `just blossom-typecheck`
- `just blossom-lint`

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

## Railway

Railway's default builder does not include Bun, so Blossom should be deployed
with [`Dockerfile`](/Users/chris/Repos/project/comet/blossom/Dockerfile)
instead of the plain package build command.

Recommended Railway setup:

- Root directory: repo root
- Dockerfile path: `blossom/Dockerfile`
- Railway config file path: `/blossom/railway.toml`
- Port: `3000`
- Healthcheck path: `/healthz`

Required environment variables:

- `DATABASE_URL`
- `S3_BUCKET`

Set any required S3 credentials for your chosen provider as environment
variables too. If you want returned blob URLs to use a custom hostname, also
set `BLOSSOM_PUBLIC_URL`.
