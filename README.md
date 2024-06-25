<div align="center"><p>
    <h1>Captain's Log 📝</h1>
    <a href="https://github.com/nodetec/captains-log/releases/latest">
      <img alt="Latest release" src="https://img.shields.io/github/v/release/nodetec/captains-log?style=for-the-badge&logo=starship&color=C9CBFF&logoColor=D9E0EE&labelColor=302D41" />
    </a>
    <a href="https://github.com/nodetec/captains-log/pulse">
      <img alt="Last commit" src="https://img.shields.io/github/last-commit/nodetec/captains-log?style=for-the-badge&logo=starship&color=8bd5ca&logoColor=D9E0EE&labelColor=302D41"/>
    </a>
    <a href="https://github.com/nodetec/captains-log/stargazers">
      <img alt="Stars" src="https://img.shields.io/github/stars/nodetec/captains-log?style=for-the-badge&logo=starship&color=c69ff5&logoColor=D9E0EE&labelColor=302D41" />
    </a>
    <a href="https://github.com/nodetec/captains-log/issues">
      <img alt="Issues" src="https://img.shields.io/github/issues/nodetec/captains-log?style=for-the-badge&logo=bilibili&color=F5E0DC&logoColor=D9E0EE&labelColor=302D41" />
    </a>
    <a href="https://github.com/nodetec/captains-log">
      <img alt="Repo Size" src="https://img.shields.io/github/repo-size/nodetec/captains-log?color=%23DDB6F2&label=SIZE&logo=codesandbox&style=for-the-badge&logoColor=D9E0EE&labelColor=302D41" />
    </a>

</div>

Captain's Log is a note-taking app for nostr.

## For Developers

To get started, clone the repository and run the following commands:

To install the dependencies:

```bash
npm install
```

To run the application:

```bash
npm run tauri dev
```

## Note on Mac OS

If you are using Mac OS you might notice that the app says it's damaged, you may need to remove the extended attributes from the application bundle. To do this, run the following command:

```bash
xattr -cr /Applications/captains-log.app
```

https://developer.apple.com
