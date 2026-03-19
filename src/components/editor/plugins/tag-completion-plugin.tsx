import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  IS_CODE,
} from "lexical";
import { $isCodeNode } from "@lexical/code";
import { invoke } from "@tauri-apps/api/core";
import { mergeRegister } from "@lexical/utils";

type MenuState = {
  query: string;
  tags: string[];
  rect: DOMRect;
  anchorKey: string;
  leadOffset: number;
  replaceableLength: number;
};

// Matches #<word> at cursor position, returns match info or null.
// Trigger character must appear after whitespace, start of text, or open paren.
function matchHashtag(textUpToCursor: string): {
  matchingString: string;
  leadOffset: number;
  replaceableLength: number;
} | null {
  const match = /(?:^|\s|\()#([^\s#.,+*?$@|{}()^\-[\]\\/!%'"~=<>_:;]{1,75})$/.exec(
    textUpToCursor,
  );
  if (!match) return null;
  const matchingString = match[1];
  const leadOffset = match.index + match[0].length - matchingString.length - 1;
  return {
    matchingString,
    leadOffset,
    replaceableLength: matchingString.length + 1, // includes the #
  };
}

function TagMenuItem({
  isSelected,
  tag,
  onClick,
  onMouseEnter,
}: {
  isSelected: boolean;
  tag: string;
  onClick: () => void;
  onMouseEnter: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest" });
    }
  }, [isSelected]);

  return (
    <li
      ref={ref}
      role="option"
      aria-selected={isSelected}
      className={`cursor-pointer mx-1 rounded px-2 py-1.5 text-sm ${
        isSelected ? "bg-accent text-accent-foreground" : ""
      }`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <span className="text-muted-foreground">#</span>
      {tag}
    </li>
  );
}

export default function TagCompletionPlugin() {
  const [editor] = useLexicalComposerContext();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset selection when menu changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [menu?.tags]);

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

  const selectTag = useCallback(
    (tag: string) => {
      if (!menu) return;
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = selection.anchor.getNode();
        if (!$isTextNode(node)) return;
        const replacement = `#${tag} `;
        node.spliceText(menu.leadOffset, menu.replaceableLength, replacement);
        node.select(
          menu.leadOffset + replacement.length,
          menu.leadOffset + replacement.length,
        );
      });
      closeMenu();
    },
    [editor, menu, closeMenu],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!menu) return;

    const moveDown = (event: Event) => {
      event.preventDefault();
      setSelectedIndex((i) => (i + 1) % menu.tags.length);
    };
    const moveUp = (event: Event) => {
      event.preventDefault();
      setSelectedIndex((i) => (i - 1 + menu.tags.length) % menu.tags.length);
    };

    // Ctrl+J / Ctrl+K navigation via DOM listener
    const root = editor.getRootElement();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === "j") {
        moveDown(e);
      } else if (e.key === "k") {
        moveUp(e);
      }
    };
    root?.addEventListener("keydown", handleKeyDown);

    return mergeRegister(
      () => root?.removeEventListener("keydown", handleKeyDown),
      editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          moveDown(event);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          moveUp(event);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          event?.preventDefault();
          selectTag(menu.tags[selectedIndex]);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          event.preventDefault();
          selectTag(menu.tags[selectedIndex]);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          closeMenu();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor, menu, selectedIndex, selectTag, closeMenu]);

  // Trigger detection on editor updates
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          closeMenu();
          return;
        }

        const anchor = selection.anchor;
        const anchorNode = anchor.getNode();
        if (!$isTextNode(anchorNode)) {
          closeMenu();
          return;
        }

        // Skip code contexts
        const parent = anchorNode.getParent();
        if (parent && $isCodeNode(parent)) {
          closeMenu();
          return;
        }
        if ((anchorNode.getFormat() & IS_CODE) !== 0) {
          closeMenu();
          return;
        }

        const textUpToCursor = anchorNode
          .getTextContent()
          .slice(0, anchor.offset);
        const match = matchHashtag(textUpToCursor);

        if (!match) {
          closeMenu();
          if (debounceRef.current) clearTimeout(debounceRef.current);
          return;
        }

        const anchorKey = anchorNode.getKey();

        // Debounce the search
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          void invoke<string[]>("search_tags", {
            query: match.matchingString,
          }).then(
            (tags) => {
              // Filter out exact matches (user already typed this)
              const filtered = tags.filter(
                (t) => t !== match.matchingString.toLowerCase(),
              );
              if (filtered.length === 0) {
                closeMenu();
                return;
              }

              // Get cursor rect for positioning
              const domSelection = window.getSelection();
              if (!domSelection || domSelection.rangeCount === 0) return;
              const range = domSelection.getRangeAt(0);
              const rect = range.getBoundingClientRect();

              setMenu({
                query: match.matchingString,
                tags: filtered,
                rect,
                anchorKey,
                leadOffset: match.leadOffset,
                replaceableLength: match.replaceableLength,
              });
            },
            () => closeMenu(),
          );
        }, 150);
      });
    });
  }, [editor, closeMenu]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!menu) return null;

  const editorRoot = editor.getRootElement();
  if (!editorRoot) return null;

  return createPortal(
    <ul
      role="listbox"
      className="fixed z-50 max-h-[200px] overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-md"
      style={{
        top: menu.rect.bottom + 4,
        left: menu.rect.left,
      }}
    >
      {menu.tags.map((tag, i) => (
        <TagMenuItem
          key={tag}
          isSelected={selectedIndex === i}
          tag={tag}
          onClick={() => selectTag(tag)}
          onMouseEnter={() => setSelectedIndex(i)}
        />
      ))}
    </ul>,
    document.body,
  );
}
