# @lezer/markdown patch

Patched fork of `@lezer/markdown` to relax ordered list parsing rules for a better notes editor experience.

## What's patched

### Ordered lists can interrupt paragraphs with any number

`isOrderedList()` in `dist/index.js` — removed the CommonMark restriction that ordered list items can only interrupt a paragraph if they start with `1.`. Now any ordered list item (e.g., `3.`) breaks a paragraph.

**Why:** In a notes editor, users create numbered lists mixed with bullet sub-lists. Without this patch, an ordered item after a nested bullet list gets swallowed as paragraph content because the parser's context stack has already popped the OrderedList by the time the leaf block continuation check runs.

**Before (CommonMark strict):**

```
1. first
  - nested

3. this is treated as paragraph text, not a list item
```

**After (patched):**

```
1. first
  - nested

2. this is recognized as ordered list item 2
```

## How the patch is applied

The patch lives at `patches/@lezer__markdown.patch` and is referenced in `pnpm-workspace.yaml` under `patchedDependencies`. It's auto-applied on every `pnpm install`.

## Making changes

1. Run `pnpm patch @lezer/markdown`
2. Edit the dist files at the path pnpm prints
3. Run `pnpm patch-commit <path>`

## Updating upstream

1. Bump `@lezer/markdown` version in `app/package.json`
2. Run `pnpm install` — the patch auto-applies
3. If the patch fails (upstream changed the patched area), regenerate:
   - Run `pnpm patch @lezer/markdown`
   - Re-apply the change to `isOrderedList()`: remove the `breaking && !inList(cx, Type.OrderedList) && ...` condition
   - Run `pnpm patch-commit <path>`
