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
- Run checks: `just check`

The seed script resets the local app database by default. To seed a throwaway database instead, pass `COMET_DB_PATH=/tmp/comet.db`.
