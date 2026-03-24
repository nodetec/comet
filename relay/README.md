# Relay

Relay is the Bun-based workspace for the revision-sync extension currently
being designed in the Comet repo.

It has a revision-native data model:

- immutable revision metadata
- explicit parent edges
- materialized current heads
- fetchable encrypted payload bodies
- relay-local `CHANGES`
- revision-aware Negentropy bootstrap

## Commands

- `bun run src/index.ts`: start the relay
- `bun --watch src/index.ts`: start in watch mode
- `bun run src/dev/multi-relay.ts`: start a local multi-relay cluster for testing
- `bun test --max-concurrency 1`: run the test suite serially

## Railway Deploy

Railway's default builder does not include Bun, so the relay should be deployed
with [`Dockerfile`](/Users/chris/Repos/project/comet/relay/Dockerfile) instead
of the plain package build command.

Recommended Railway setup:

- Root directory: repo root
- Dockerfile path: `relay/Dockerfile`
- Railway config file path: `/relay/railway.toml` if you want Railway to read the checked-in deploy config
- Port: `3400`
- Healthcheck path: `/healthz`

If you are configuring the service entirely through the Railway UI instead of a
checked-in config file, set:

- `RAILWAY_DOCKERFILE_PATH=/relay/Dockerfile`

Required environment variables:

- `DATABASE_URL`
- `RELAY_URL`

Recommended environment variables:

- `PRIVATE_MODE=true`
- `RELAY_ADMIN_TOKEN=<long-random-secret>`
- `RELAY_DEFAULT_PAYLOAD_RETENTION_DAYS=90`
- `RELAY_DEFAULT_COMPACTION_INTERVAL_SECONDS=300`

Example `RELAY_URL`:

```sh
RELAY_URL=wss://relay.comet.md
```

### Local Multi-Relay Harness

To spin up several local relays backed by separate local Postgres databases:

```sh
bun run src/dev/multi-relay.ts --count 3 --start-port 3400
```

Or from the repo root:

```sh
just relay-dev-multi 3 3400
```

Useful options:

- `--count <n>`: number of relays to start
- `--start-port <n>`: first relay port
- `--admin-db <url>`: admin Postgres URL used to create/drop relay databases
- `--keep-databases`: leave the created databases in place after shutdown

The harness prints each relay websocket URL and cleans up the processes and temporary databases on `Ctrl+C`.

## Admin Retention API

The relay exposes a small HTTP admin API for payload-retention policy:

- `GET /admin/retention`
- `PATCH /admin/retention`

Example update:

```sh
curl -X PATCH http://127.0.0.1:3400/admin/retention \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"payload_retention_days":90,"compaction_interval_seconds":300}'
```

Fields:

- `payload_retention_days`
  - `null` disables automatic payload compaction
  - non-head revision payloads older than this many days become eligible
- `compaction_interval_seconds`
  - how often the relay runs the compaction pass

Environment variables:

- `PRIVATE_MODE`
  - when `true`, the relay sends websocket `AUTH` challenges and requires NIP-42 authentication for revision reads and writes
- `RELAY_ADMIN_TOKEN`
  - bearer token used for protected admin endpoints
- `RELAY_DEFAULT_PAYLOAD_RETENTION_DAYS`
  - default policy before any admin API update is persisted
- `RELAY_DEFAULT_COMPACTION_INTERVAL_SECONDS`
  - default scheduler interval before any admin API update is persisted

## Access Admin API

The relay also exposes protected operator endpoints for access control and connection inspection:

- `GET /admin/allowlist`
- `POST /admin/allowlist`
- `DELETE /admin/allowlist/:pubkey`
- `GET /admin/connections`

Notes:

- `/admin/allowlist` and `/admin/connections` require `RELAY_ADMIN_TOKEN`
- in `PRIVATE_MODE`, revision websocket clients must authenticate and the authenticated pubkey must be present on the allowlist
- `/admin/connections` reports authenticated pubkeys and active live `CHANGES` subscription ids per websocket connection

## Current State

This workspace now has:

- revision-native Postgres schema and migrations
- revision publish, head materialization, and live `CHANGES`
- revision-aware Negentropy bootstrap with `snapshot_seq` handoff
- payload-retention advertisement and payload compaction
- an HTTP admin API for runtime retention policy updates
- a local multi-relay harness and a broad relay integration suite
