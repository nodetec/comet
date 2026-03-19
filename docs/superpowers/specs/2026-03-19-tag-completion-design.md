# Tag Completion via Native Dropdown Menu

## Overview

Add inline tag autocomplete to the Lexical editor. When the user types `#` followed by one or more characters, a native OS context menu appears showing matching tags. Selecting a tag completes the text inline.

## Architecture

A single new Lexical plugin (`tag-completion-plugin.tsx`) that combines Lexical's trigger detection utilities with Tauri's native menu API.

### Components

**Trigger Detection**
- Uses `useBasicTypeaheadTriggerMatch('#', { minLength: 1 })` from `@lexical/react/LexicalTypeaheadMenuPlugin`
- This hook returns a `TriggerFn` with signature `(text: string, editor: LexicalEditor) => MenuTextMatch | null`
- The `text` parameter is the text from the start of the current text node up to the cursor position
- Returns `{ leadOffset, matchingString, replaceableString }` on match, or `null`
- We use only the trigger detection utility — not the full `LexicalTypeaheadMenuPlugin` component, which is tightly coupled to DOM-based menu rendering and keyboard handling that would conflict with the native menu

**Editor Update Listener**
- Registers a Lexical update listener via `editor.registerUpdateListener`
- On each update, reads the editor state to extract trigger context:
  1. Get the current `$getSelection()` — bail if not a `RangeSelection` or if it's not collapsed
  2. Get the anchor node — bail if it's not a `TextNode`
  3. Bail if the node's parent is a `CodeNode` or the node itself is a `CodeHighlightNode`
  4. Extract text from the start of the text node up to `selection.anchor.offset`
  5. Call `triggerFn(textUpToCursor, editor)` — if it returns a match, proceed to tag search

**Tag Search**
- When a trigger match is found, calls `search_tags(matchingString)` via Tauri `invoke()`
- Debounced at 150ms to avoid excessive backend calls while typing
- Stale results are discarded by comparing the current match string when results arrive

**Native Menu**
- Creates a Tauri `Menu` with matching tags as items (from `@tauri-apps/api/menu`)
- Positioned at the cursor's screen coordinates using `window.getSelection().getRangeAt(0).getBoundingClientRect()` and `LogicalPosition` from `@tauri-apps/api/dpi`
- Menu appears below the cursor position (`rect.x`, `rect.bottom`)
- Always cleaned up via `menu.close()` in a `finally` block

**Text Replacement**
- On tag selection, inside `editor.update()`:
  - Uses `spliceText(leadOffset, replaceableString.length, '#' + selectedTag)` on the text node for in-place replacement (`replaceableString` is `#` + partial text, so its `.length` covers exactly the characters to replace)
  - Moves cursor to end of the inserted tag
- No node creation/deletion needed — text node stays intact

### Data Flow

```
User types "#pro"
  → Lexical update listener fires
  → TriggerFn detects match: { leadOffset: N, matchingString: "pro" }
  → Skip if inside CodeNode/CodeHighlightNode
  → Debounced invoke("search_tags", { query: "pro" })
  → Backend returns ["productivity", "project", "programming"]
  → If match string still current:
    → Get cursor DOMRect via window.getSelection()
    → Menu.new({ items: [{ text: "productivity", action }, ...] })
    → menu.popup(LogicalPosition(rect.x, rect.bottom))
    → User selects "project"
    → editor.update(() => textNode.spliceText(..., "#project"))
    → menu.close()
```

## Edge Cases

- **No results:** If `search_tags` returns empty, no menu is shown
- **Fast typing:** 150ms debounce prevents hammering the backend; stale results are discarded by checking current match string against the one that initiated the request
- **Menu already open:** `menu.popup()` is async and blocks — the user cannot type in the editor while a native menu is showing, so no concurrent trigger issue
- **Menu dismissed without selection:** When the user dismisses the menu (Escape or clicking away), track the dismissed match string. Suppress re-triggering for the same match string until the text changes (i.e., the user types or deletes a character). This prevents the menu from popping up in a loop after dismissal.
- **Code blocks:** Trigger detection is skipped when the cursor is inside a `CodeNode` or `CodeHighlightNode`, since tags in code blocks are not meaningful
- **Menu cleanup:** `menu.close()` always called in a `finally` block, matching existing codebase patterns

## Files Changed

| File | Change |
|------|--------|
| `src/components/editor/plugins/tag-completion-plugin.tsx` | **New.** The entire plugin implementation |
| `src/components/editor/note-editor.tsx` | **Modified.** Add `<TagCompletionPlugin />` to the plugin list |

## Dependencies

All already available — no new packages needed:

- `@lexical/react/LexicalTypeaheadMenuPlugin` — for `useBasicTypeaheadTriggerMatch` hook (v0.41.0, installed)
- `@tauri-apps/api/menu` — for `Menu` (already used in sidebar, editor, notes panes)
- `@tauri-apps/api/dpi` — for `LogicalPosition` (already used)
- `@tauri-apps/api/core` — for `invoke` (already used)

## Backend

No changes. The existing `search_tags` Tauri command already:
- Accepts a query string
- Returns up to 20 matching tags (case-insensitive LIKE)
- Query: `SELECT DISTINCT tag FROM note_tags WHERE tag LIKE ? ORDER BY tag ASC`

## Tauri Capabilities

No changes. `core:menu:allow-popup` is already enabled in `src-tauri/capabilities/default.json`.
