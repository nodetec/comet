---
title: Getting Started
description: Install dependencies and run the major Comet workspaces locally.
---

## Prerequisites

- `pnpm`
- `just`
- Rust toolchain for the desktop app
- Bun if you plan to run the relay or Blossom workspaces

Install `just` with `brew install just` or `cargo install just`.

## Install dependencies

```sh
just install
```

## Common local workflows

Run the desktop app:

```sh
just app-dev
```

Run the standalone docs site:

```sh
just docs-dev
```

Build the docs site:

```sh
just docs-build
```

Run the main app verification suite:

```sh
just app-check
```

## Workspace commands

- `just relay-dev` runs the relay workspace.
- `just blossom-dev` runs the Blossom workspace.
- `just web-dev` runs the web workspace.
- `just format-check` checks formatting across the repo.

## Notes

- `just app-build` and `just app-check` do not require Bun.
- Relay and Blossom tests use Postgres through `TEST_DATABASE_URL`.
- The seed script resets the local app database by default, so point
  `COMET_DB_PATH` at a disposable path if needed.
