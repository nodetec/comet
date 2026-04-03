# @codemirror/view patch

Patched fork of `@codemirror/view` with padding-aware cursor positioning for `drawSelection()`.

## What's patched

### Cursor skips padding when entering padded marks

`LineTile.coordsIn()` in `src/tile.ts` — when the cursor enters a padded `MarkTile` from outside (e.g., arrowing into a tag with `padding: 0 0.25rem`), the resolved tile is re-resolved from the inside and pre-flattened to the text edge. This makes the cursor land flush against the text content, skipping the padding gap.

**Why:** CM6's `drawSelection()` draws the cursor based on text node coordinates which don't include parent element padding. Without the patch, the cursor appears to stop in the padding gap between the tag border and the text content when entering from outside.

The patch also includes `tileHasPadding()` which walks up through nested `MarkTile` ancestors to detect padding at any level.

## Files

- `src/` — patched TypeScript source (built from `repos/dev/view/src/`)
- `dist/` — built output used to generate the pnpm patch

## How the patch is applied

The patch lives at `patches/@codemirror__view.patch` and is referenced in `pnpm-workspace.yaml` under `patchedDependencies`. It's auto-applied on every `pnpm install`.

## Making changes

1. Edit the source in `repos/dev/view/src/tile.ts`
2. Build:
   ```sh
   cd repos/dev/view
   ../node_modules/.bin/cm-buildhelper src/index.ts
   ```
3. Copy built files to this package:
   ```sh
   cp -f repos/dev/view/dist/index.js repos/dev/view/dist/index.cjs repos/dev/view/dist/index.d.ts packages/codemirror-view/dist/
   ```
4. Regenerate the pnpm patch:
   ```sh
   pnpm patch @codemirror/view
   # copy dist files into the path pnpm prints
   cp -f packages/codemirror-view/dist/index.js packages/codemirror-view/dist/index.cjs <pnpm-patch-path>/dist/
   pnpm patch-commit <pnpm-patch-path>
   ```
5. Clear Vite cache and restart dev server:
   ```sh
   rm -rf app/node_modules/.vite
   ```

## Updating upstream

1. Bump `@codemirror/view` version in `app/package.json`
2. Run `pnpm install` — the patch auto-applies
3. If the patch fails to apply (upstream changed the patched area), re-apply from source:
   - Pull upstream changes into `repos/dev/view`
   - Re-apply the `tileHasPadding` and `coordsIn` changes to `src/tile.ts`
   - Follow the "Making changes" steps above
