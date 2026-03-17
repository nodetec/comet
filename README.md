# comet

- Local first note-taking app built with Tauri.
- Encrypted Sync with nostr
- Encrypted blob storage with blossom

Development:

- Install dependencies: `npm install`
- Start the desktop app: `npm run tauri:dev`
- Build the app bundle: `npm run tauri build -- --bundles app`
- Seed demo notebooks and notes: `npm run seed:db`

The seed script resets the local app database by default. To seed a throwaway database instead, pass `COMET_DB_PATH=/tmp/comet.db`.
