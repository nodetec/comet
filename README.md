# ☄️ Comet

![comet](https://private-user-images.githubusercontent.com/29136904/423198103-0b77558c-83db-46da-9567-6c4cdbcd0a62.png?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NDIxMTQ1MDgsIm5iZiI6MTc0MjExNDIwOCwicGF0aCI6Ii8yOTEzNjkwNC80MjMxOTgxMDMtMGI3NzU1OGMtODNkYi00NmRhLTk1NjctNmM0Y2RiY2QwYTYyLnBuZz9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTAzMTYlMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUwMzE2VDA4MzY0OFomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPWJjNWE0Mjk5ODIwM2U2MzM0MmM5NGI1MTQ2YjRiYjJkNDgwMjgwYTk1YzY1Y2IzYzU4MDExN2ExZmUxNTg1M2EmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.WQYJ3Ew45E1Vr9AH_PZi-0ukNiDJ7Uc9MzUEc8Q-tpk)

Comet is a desktop app for taking and publishing notes for nostr.

## Development

### Install Dependencies

```sh
npm i --force
```

### Run the app

```sh
npm run dev
```

### Package the app

```sh
npm run package
```

## Make the app for your platform

### Linux Dependencies

For RPM

```sh
sudo apt install rpm
```

For AppImage

```sh
sudo apt install squashfs-tools
```

```sh
npm run make
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
