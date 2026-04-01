# Editor Invariants

Comet should behave as a lossless markdown-first editor for its supported feature set.

## Goal

Editing, saving, loading, syncing, rendering, copying, and pasting should preserve the same document semantics and, where possible, the same authored markdown structure. Passing a note through Lexical AST, HTML, clipboard, or sync codecs should not create avoidable drift.

## Canonical Representation

- Stored note markdown is the canonical representation for editor content.
- Lexical AST is an in-memory editing model derived from markdown.
- Rendered HTML is a derived import/render format, not a source of truth.
- Sync payloads and clipboard payloads are transport formats, not canonical storage.

## Required Invariants

- `markdown -> load/import -> markdown` should be stable for supported syntax.
- `markdown -> sync encode/decode -> markdown` should be stable for supported syntax.
- `markdown -> copy/paste -> markdown` should be stable when the pasted content stays within supported editor features.
- Saving a note and then reloading it should not change markdown unless the user changed the content.
- Local save plus sync echo must not rewrite the open note into a different markdown string.
- Equivalent representations must not cause cursor jumps, remounts, or selection loss.

## Preservation Rules

- Preserve authored block structure, spacing, and supported markdown constructs whenever possible.
- Prefer preserving authored markdown over "cleaning up" formatting implicitly.
- If normalization is necessary, it must be:
  - intentional
  - documented
  - minimal
  - idempotent after one pass

## What Counts As Drift

Examples of unacceptable drift:

- adding or removing blank lines during save/load or sync
- changing whether the title is stored inline in markdown versus reconstructed later in a way that changes the document string
- moving pasted content to a different structural location than the user targeted
- exporting a different checklist, quote, image, or table shape than the imported content
- remounting the editor because equivalent content was rewritten into a different string

## Engineering Rules

- When changing editor import/export logic, test the exact seam you touched.
- When changing sync codecs, add round-trip tests for markdown preservation.
- When changing clipboard handling, add paste/copy regression coverage for the affected structure.
- Prefer fixing the representation boundary that introduced drift rather than patching over the symptom later in the pipeline.
- Do not add compatibility hacks that preserve broken intermediate states unless there is a clear migration need.

## Test Guidance

At minimum, add targeted regression tests for:

- markdown round-trip stability
- sync encode/decode stability
- clipboard paste/import stability
- save/load stability when a note is reopened
- selection/caret preservation when async editor operations complete

If a bug was visible to the user, there should usually be a test that reproduces the exact shape of the failing content.
