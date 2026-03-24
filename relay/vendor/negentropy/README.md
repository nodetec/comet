# Vendored Negentropy

This directory vendors the upstream JavaScript reference implementation from:

- Project: `hoytech/negentropy`
- URL: <https://github.com/hoytech/negentropy>
- Source file: `js/Negentropy.js`
- Upstream commit: `8129c5e7799211083c6dcc72ff3a33a99c27fd08`

Files copied here:

- `Negentropy.js`
- `LICENSE`

Reason for vendoring:

- `relay` wants to use the reference Negentropy implementation as the core reconciliation engine
- the rest of the workspace is Bun + TypeScript and should not depend on ad hoc relative imports into a cloned sibling repo
- vendoring gives stable local builds while keeping upstream provenance explicit

Usage rule:

- Treat the vendored code as third-party code.
- Do not edit it casually.
- Wrap it behind a typed TypeScript adapter in `src/`.
- If the upstream implementation needs to be updated, copy the new file in explicitly and update this README with the new commit.
