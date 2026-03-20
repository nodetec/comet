# Relay

Relay is the Bun-based Nostr relay workspace for Comet.

## Commands

- `bun run src/index.ts`: start the relay
- `bun test --max-concurrency 1`: run the relay test suite serially
- `bun --watch src/index.ts`: start the relay in watch mode
- `just relay-deploy`: deploy the relay to Fly

## Environment

| Variable            | Default                           | Description                                                  |
| ------------------- | --------------------------------- | ------------------------------------------------------------ |
| `PORT`              | `3000`                            | HTTP and WebSocket port                                      |
| `DATABASE_URL`      | —                                 | Postgres connection string                                   |
| `RELAY_URL`         | `ws://localhost:$PORT`            | Public relay URL used for NIP-42 validation                  |
| `PRIVATE_MODE`      | `false`                           | Require AUTH and allowlist checks based on the `users` table |
| `TEST_DATABASE_URL` | `postgres://localhost/comet_test` | Postgres connection string used by relay tests               |

On Fly, `RELAY_URL` is set in [`fly.toml`](/Users/chris/Repos/project/comet/relay/fly.toml) to `wss://relay.comet.md`. If that value is removed, the relay falls back to `wss://$FLY_APP_NAME.fly.dev`. Local development and tests still use localhost URLs.

## Fly.io

- [`fly.toml`](/Users/chris/Repos/project/comet/relay/fly.toml) is the starting Fly config for the relay workspace
- [`Dockerfile`](/Users/chris/Repos/project/comet/relay/Dockerfile) builds the relay from the monorepo root using the checked-in `pnpm-lock.yaml`
- [`.github/workflows/ci.yml`](/Users/chris/Repos/project/comet/.github/workflows/ci.yml) deploys the relay on pushes to `master` after CI passes when relay runtime or deploy files changed
- Set `DATABASE_URL` as a Fly app secret before deploy. Do not store it in GitHub Actions.
- Set `FLY_API_TOKEN` as a GitHub Actions secret before enabling deploys
- Keep `PRIVATE_MODE=true` unless you intentionally want an open relay
- `RELAY_URL` is set in [`fly.toml`](/Users/chris/Repos/project/comet/relay/fly.toml) to `wss://relay.comet.md`

### First-time setup

1. Create the Fly app and update [`fly.toml`](/Users/chris/Repos/project/comet/relay/fly.toml) if `app = "comet-relay"` is not the final app name.
2. Set the database secret on Fly so the running relay has it at runtime:
   `fly secrets set DATABASE_URL=postgres://... --app <your-fly-app>`
3. Point the `relay.comet.md` DNS record at the Fly app and provision TLS for that hostname.
4. Add `FLY_API_TOKEN` to the GitHub repository secrets so [`.github/workflows/ci.yml`](/Users/chris/Repos/project/comet/.github/workflows/ci.yml) can deploy the relay job.
5. Run the first deploy manually:
   `flyctl deploy --config relay/fly.toml --remote-only`

`DATABASE_URL` is a Fly runtime secret. `FLY_API_TOKEN` is a GitHub Actions deploy secret. Keep them in those separate systems.
