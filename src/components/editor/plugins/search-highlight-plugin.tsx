import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

const HIGHLIGHT_NAME = "comet-search";
const HIGHLIGHT_STYLE_ID = "comet-search-highlight-style";
const HIGHLIGHT_STYLES = `
::highlight(${HIGHLIGHT_NAME}) {
  background-color: rgb(253 224 71);
  color: var(--background);
}
`;

function clearHighlight() {
  (CSS as CSSWithHighlights).highlights?.delete(HIGHLIGHT_NAME);
}

function getOrCreateStyleElement() {
  let style = document.getElementById(HIGHLIGHT_STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement("style");
    style.id = HIGHLIGHT_STYLE_ID;
    document.head.appendChild(style);
  }
  return style;
}

export default function SearchHighlightPlugin({
  searchWords,
}: {
  searchWords: string[];
}) {
  const [editor] = useLexicalComposerContext();

  // Toggle highlight visibility by adding/removing the CSS rule.
  // Highlight ranges stay registered — they're just invisible without the rule.
  useEffect(() => {
    return editor.registerRootListener((root, prevRoot) => {
      if (prevRoot) {
        prevRoot.removeEventListener("focusin", handleFocusIn);
        prevRoot.removeEventListener("focusout", handleFocusOut);
      }
      if (root) {
        root.addEventListener("focusin", handleFocusIn);
        root.addEventListener("focusout", handleFocusOut);

        // Sync to current state
        if (root.contains(document.activeElement)) {
          handleFocusIn();
        } else {
          handleFocusOut();
        }
      }
    });

    function handleFocusIn() {
      getOrCreateStyleElement().textContent = "";
    }

    function handleFocusOut() {
      getOrCreateStyleElement().textContent = HIGHLIGHT_STYLES;
    }
  }, [editor]);

  // Maintain highlight ranges — always applied regardless of focus.
  useEffect(() => {
    const highlights = (CSS as CSSWithHighlights).highlights;
    if (!highlights) return;

    getOrCreateStyleElement().textContent = HIGHLIGHT_STYLES;

    if (searchWords.length === 0) {
      highlights.delete(HIGHLIGHT_NAME);
      return;
    }

    const apply = () => {
      const root = editor.getRootElement();
      if (!root) {
        highlights.delete(HIGHLIGHT_NAME);
        return;
      }

      const escaped = searchWords.map((w) =>
        w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      );
      const regex = new RegExp(`(${escaped.join("|")})`, "gi");
      const ranges: Range[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

      let textNode: Text | null;
      while ((textNode = walker.nextNode() as Text | null)) {
        const text = textNode.textContent || "";
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
          const range = new Range();
          range.setStart(textNode, match.index);
          range.setEnd(textNode, match.index + match[0].length);
          ranges.push(range);
        }
      }

      if (ranges.length > 0) {
        highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
      } else {
        highlights.delete(HIGHLIGHT_NAME);
      }
    };

    apply();
    return editor.registerUpdateListener(() => {
      apply();
    });
  }, [editor, searchWords]);

  useEffect(() => clearHighlight, []);

  return null;
}

type CSSWithHighlights = typeof CSS & {
  highlights?: Map<string, Highlight>;
};
