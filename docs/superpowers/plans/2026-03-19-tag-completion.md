# Tag Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline tag autocomplete to the Lexical editor using Tauri's native OS context menu.

**Architecture:** A single Lexical plugin detects `#` trigger text, queries existing tags via Tauri invoke, and shows a native menu at the cursor position. On selection, the partial tag text is replaced inline. Uses `useBasicTypeaheadTriggerMatch` from `@lexical/react` for trigger detection.

**Tech Stack:** Lexical 0.41.0, Tauri 2 (`@tauri-apps/api/menu`), React 19, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-19-tag-completion-design.md`

**Note:** This project has no test runner configured. Verification is via `npm run typecheck` and `npm run lint`, plus manual testing in `npm run tauri:dev`.

---

## File Structure

| File | Role |
|------|------|
| `src/components/editor/plugins/tag-completion-plugin.tsx` | **New.** Self-contained Lexical plugin: trigger detection, tag search, native menu, text replacement |
| `src/components/editor/note-editor.tsx` | **Modified.** Register the new plugin |

---

### Task 1: Create the tag completion plugin

**Files:**
- Create: `src/components/editor/plugins/tag-completion-plugin.tsx`

**Key context for the implementer:**
- The editor has a `HashtagExtension` (`src/components/editor/extensions/hashtag-extension.ts`) that auto-converts `#text` into `HashtagNode` (extends `TextNode`) via node transforms. By the time your update listener fires, `#pro` will already be a `HashtagNode`. This is fine — `$isTextNode(hashtagNode)` returns `true` since `HashtagNode extends TextNode`, and `spliceText` works on it.
- The `$isInsideCode` pattern is already used in `hashtag-extension.ts` — check the parent with `$isCodeNode(parent)` and the node format with `IS_CODE`. However, since `HashtagNode` already skips code contexts (its transform reverts to plain text inside code), you only need the code check for plain `TextNode` anchors that haven't been transformed yet.
- Existing native menu pattern (see `sidebar-pane.tsx:174-189`): `Menu.new({ items }) → menu.popup(LogicalPosition) → menu.close()` in a `try/finally`.
- `search_tags` Tauri command: `invoke("search_tags", { query: string })` returns `string[]` (up to 20 matches).

- [ ] **Step 1: Write the plugin skeleton**

```tsx
import { useCallback, useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useBasicTypeaheadTriggerMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalEditor,
} from "lexical";
import { $isCodeNode } from "@lexical/code";
import { Menu } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";

export default function TagCompletionPlugin() {
  const [editor] = useLexicalComposerContext();
  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("#", {
    minLength: 1,
  });
  const menuOpenRef = useRef(false);
  const dismissedMatchRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // TODO: implement update listener (step 2)
  // TODO: implement showTagMenu (step 3)

  return null;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (plugin is imported nowhere yet, but file should compile)

- [ ] **Step 3: Add the update listener with trigger detection**

Add inside the component, after the refs:

```tsx
const showTagMenu = useCallback(
  async (
    matchingString: string,
    replaceableString: string,
    leadOffset: number,
    anchorKey: string,
  ) => {
    // Will be implemented in step 5
  },
  [editor],
);

useEffect(() => {
  return editor.registerUpdateListener(({ editorState }) => {
    if (menuOpenRef.current) return;

    editorState.read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;

      const anchor = selection.anchor;
      const anchorNode = anchor.getNode();
      if (!$isTextNode(anchorNode)) return;

      // Skip code contexts
      const parent = anchorNode.getParent();
      if (parent && $isCodeNode(parent)) return;

      const textUpToCursor = anchorNode
        .getTextContent()
        .slice(0, anchor.offset);
      const match = checkForTriggerMatch(textUpToCursor, editor);

      if (!match) {
        dismissedMatchRef.current = null;
        return;
      }

      // Suppress re-trigger after dismiss
      if (dismissedMatchRef.current === match.matchingString) return;

      // Debounce the tag search
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        showTagMenu(
          match.matchingString,
          match.replaceableString,
          match.leadOffset,
          anchorNode.getKey(),
        );
      }, 150);
    });
  });
}, [editor, checkForTriggerMatch, showTagMenu]);

// Cleanup debounce timer on unmount
useEffect(() => {
  return () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  };
}, []);
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Implement showTagMenu with native menu and text replacement**

Replace the empty `showTagMenu` callback with:

```tsx
const showTagMenu = useCallback(
  async (
    matchingString: string,
    replaceableString: string,
    leadOffset: number,
    anchorKey: string,
  ) => {
    if (menuOpenRef.current) return;

    const tags = await invoke<string[]>("search_tags", {
      query: matchingString,
    });
    if (tags.length === 0) return;

    // Verify the match is still current
    const stillValid = editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
      const node = selection.anchor.getNode();
      if (!$isTextNode(node) || node.getKey() !== anchorKey) return false;
      const text = node.getTextContent().slice(0, selection.anchor.offset);
      const currentMatch = checkForTriggerMatch(text, editor);
      return currentMatch?.matchingString === matchingString;
    });
    if (!stillValid) return;

    // Get cursor position for menu placement
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) return;
    const range = domSelection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    let selectedTag: string | null = null;

    const menu = await Menu.new({
      items: tags.map((tag) => ({
        id: `tag-${tag}`,
        text: `#${tag}`,
        action: () => {
          selectedTag = tag;
        },
      })),
    });

    menuOpenRef.current = true;
    try {
      await menu.popup(new LogicalPosition(rect.x, rect.bottom));
    } finally {
      await menu.close();
      menuOpenRef.current = false;
    }

    if (selectedTag) {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = selection.anchor.getNode();
        if (!$isTextNode(node)) return;
        node.spliceText(leadOffset, replaceableString.length, `#${selectedTag}`);
        // Move cursor to end of inserted tag
        node.select(leadOffset + selectedTag!.length + 1, leadOffset + selectedTag!.length + 1);
      });
    } else {
      // Menu dismissed without selection
      dismissedMatchRef.current = matchingString;
    }
  },
  [editor, checkForTriggerMatch],
);
```

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/plugins/tag-completion-plugin.tsx
git commit -m "Add tag completion plugin with native menu"
```

---

### Task 2: Register the plugin in the editor

**Files:**
- Modify: `src/components/editor/note-editor.tsx`

- [ ] **Step 1: Add the import**

Add after the other plugin imports (around line 55):

```tsx
import TagCompletionPlugin from "./plugins/tag-completion-plugin";
```

- [ ] **Step 2: Add the plugin component**

Add `<TagCompletionPlugin />` inside `EditorInner`'s JSX, after `<TodoShortcutPlugin />` (around line 228):

```tsx
<TodoShortcutPlugin />
<TagCompletionPlugin />
```

- [ ] **Step 3: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/note-editor.tsx
git commit -m "Register tag completion plugin in editor"
```

---

### Task 3: Manual testing

- [ ] **Step 1: Start the dev app**

Run: `npm run tauri:dev`

- [ ] **Step 2: Seed test data (if no tags exist)**

Run: `npm run seed:db`
This resets the DB with demo data that includes notes with tags.

- [ ] **Step 3: Test basic flow**

1. Open a note in the editor
2. Type `#` followed by a letter that matches existing tags
3. Verify: native OS menu appears below the cursor with matching tags
4. Select a tag from the menu
5. Verify: the partial text is replaced with the full tag (e.g., `#pro` → `#project`)

- [ ] **Step 4: Test edge cases**

1. Type `#xyz` (no matching tags) → verify no menu appears
2. Type `#` inside a code block → verify no menu appears
3. Type `#pro`, dismiss menu with Escape → verify menu does not reappear until you type another character
4. Type `#pro`, select a tag, then type another `#` tag → verify completion works again

- [ ] **Step 5: Fix any issues found, commit**

```bash
git add -u
git commit -m "Fix tag completion issues from manual testing"
```
