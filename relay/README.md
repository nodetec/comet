# Relay

Relay is the Bun-based workspace for Comet's snapshot-sync extension.

It implements a local-first sync transport:

- encrypted note snapshot events
- relay-local `CHANGES` bootstrap and tail replay
- bounded payload retention and compaction
- author-scoped access control
- companion and pass-through kinds alongside snapshot sync

## Commands

- `bun run src/index.ts`: start the relay
- `bun --watch src/index.ts`: start in watch mode
- `bun run src/dev/multi-relay.ts`: start a local multi-relay cluster for testing
- `bun test --max-concurrency 1`: run the test suite serially

## Railway Deploy

Railway's default builder does not include Bun, so deploy this workspace with [`Dockerfile`](/Users/chris/Repos/project/comet/relay/Dockerfile).

Recommended Railway setup:

- Root directory: repo root
- Dockerfile path: `relay/Dockerfile`
- Railway config file path: `/relay/railway.toml`
- Port: `3400`
- Healthcheck path: `/healthz`

Required environment variables:

- `DATABASE_URL`
- `RELAY_URL`

Recommended environment variables:

- `PRIVATE_MODE=true`
- `RELAY_ADMIN_TOKEN=<long-random-secret>`
- `RELAY_DEFAULT_PAYLOAD_RETENTION_DAYS=90`
- `RELAY_DEFAULT_COMPACTION_INTERVAL_SECONDS=300`

## Local Multi-Relay Harness

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
- `--keep-databases`: leave created databases in place after shutdown

## Admin Retention API

The relay exposes a small HTTP admin API for payload retention:

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
  - older superseded snapshot payloads become eligible
- `compaction_interval_seconds`
  - how often the relay runs the compaction pass

## Access Admin API

The relay also exposes protected operator endpoints for access control and connection inspection:

- `GET /admin/keys` — list access keys
- `POST /admin/keys` — create access key
- `DELETE /admin/keys/:key` — revoke access key
- `GET /admin/connections`

Notes:

- `/admin/keys` and `/admin/connections` require `RELAY_ADMIN_TOKEN`
- in `PRIVATE_MODE`, clients must send a `TOKEN` message with a valid access key before authenticating via NIP-42 `AUTH`
- `/admin/connections` reports access keys, authenticated pubkeys, and active live `CHANGES` subscription ids per websocket connection

## Current State

This workspace currently has:

- snapshot-oriented Postgres schema and migrations
- snapshot publish and fetch
- bootstrap and live `CHANGES`
- payload-retention advertisement and payload compaction
- an HTTP admin API for runtime retention policy updates
- a local multi-relay harness and a broad relay integration suite
