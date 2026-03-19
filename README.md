# comet

- Local first note-taking app built with Tauri.
- Encrypted Sync with nostr
- Encrypted blob storage with blossom

Development:

- Install dependencies: `npm install`
- Or with `just`: `just install`
- Start the desktop app: `npm run tauri:dev`
- Or with `just`: `just dev`
- Build the app bundle: `npm run tauri build -- --bundles app`
- Or with `just`: `just bundle`
- Seed demo notebooks and notes: `npm run seed:db`
- Lint frontend code: `npm run lint`
- Type-check frontend code: `npm run typecheck`
- Run checks: `just check`

The seed script resets the local app database by default. To seed a throwaway database instead, pass `COMET_DB_PATH=/tmp/comet.db`.

## `just`

This repo includes a project-local [`justfile`](/Users/chris/Repos/project/comet/justfile) for common development commands.

- Install `just` with `brew install just` or `cargo install just`
- List available recipes with `just --list`
- Run commands like `just dev`, `just lint`, `just typecheck`, `just test`, `just check`, `just outdated-npm`, and `just outdated-crates`
- `just outdated-crates` requires [`cargo-edit`](https://github.com/killercup/cargo-edit): install it with `cargo install cargo-edit`

## Git hooks

This repo uses Husky + lint-staged for a pre-commit hook on staged files. After `npm install`, the hook is installed automatically via the `prepare` script.

On commit, staged files run through:

- `eslint --fix` and `prettier --write` for `*.ts` and `*.tsx`
- `prettier --write` for `*.js`, `*.mjs`, `*.cjs`, `*.json`, `*.md`, `*.yml`, and `*.yaml`

### Zsh completion

Generate and install completions:

```sh
mkdir -p ~/.zsh/completions
just --completions zsh > ~/.zsh/completions/_just
```

Then make sure your `~/.zshrc` includes:

```sh
fpath=(~/.zsh/completions $fpath)
autoload -U compinit
compinit
```

Restart your shell or run `source ~/.zshrc`.
