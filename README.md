# comet

`comet` is a desktop notetaking app for people who think in text and want a calm, fast place to capture, shape, and revisit ideas. The product direction is intentionally narrow: a single-user, desktop-first notes experience that favors speed, clarity, and trust over breadth, with note content stored locally as markdown inside the app’s database and edited through a markdown-first writing surface.

Current status: active desktop shell with local SQLite-backed notes, pinning, markdown-derived tags, notebooks, archive flow, search, and editor persistence. Core linking, publishing, and sync are still ahead.

Canonical docs:

- [Vision](./docs/vision.md)
- [Principles](./docs/principles.md)
- [Roadmap](./docs/roadmap.md)

Development:

- Install dependencies: `npm install`
- Start the desktop app: `npm run tauri dev`
- Build the app bundle: `npm run tauri build -- --bundles app`
- Seed demo notebooks and notes: `npm run seed:db`

The seed script resets the local app database by default. To seed a throwaway database instead, pass `COMET_DB_PATH=/tmp/comet.db`.

Recommended IDE setup:

- [VS Code](https://code.visualstudio.com/)
- [Tauri VS Code extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
