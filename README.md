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
- Run checks: `just check`

The seed script resets the local app database by default. To seed a throwaway database instead, pass `COMET_DB_PATH=/tmp/comet.db`.

## `just`

This repo includes a project-local [`justfile`](/Users/chris/Repos/project/comet/justfile) for common development commands.

- Install `just` with `brew install just` or `cargo install just`
- List available recipes with `just --list`
- Run commands like `just dev`, `just lint`, `just test`, `just check`, `just outdated-npm`, and `just outdated-crates`
- `just outdated-crates` requires [`cargo-edit`](https://github.com/killercup/cargo-edit): install it with `cargo install cargo-edit`

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
