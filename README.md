# ☄️ Comet

Comet is a desktop app for taking and publishing notes for nostr.

## Development

Will currently only work with nodejs 20

### Install Dependencies

```sh
# needed for pouchdb-adapter-node-websql
ln -s /opt/homebrew/bin/python3 /opt/homebrew/bin/python
```

```sh
npm i --force
```

### Run the app

 ```
 npm run start
 ```

### Package the app

 ```
 npm run package
 ```

The output for you platform will be in the `out/` directory

## Tech Stack

- electron (desktop app framework)
- nostr (social media protocol)
- shadcn (components)
- nodejs (backend)
- react (frontend)
- pouchdb (database)
- tailwind (styling)
- typescript (language)
- tanstack query (async state)
- zustand (sync state)
- lexical (editor)
