import { useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

const ACTIVE_HIGHLIGHT_NAME = "comet-search-active";
const HIGHLIGHT_NAME = "comet-search";
const HIGHLIGHT_STYLE_ID = "comet-search-highlight-style";
const HIGHLIGHT_STYLES = `
::highlight(${HIGHLIGHT_NAME}) {
  background-color: var(--editor-selection);
  color: var(--editor-text);
}

::highlight(${ACTIVE_HIGHLIGHT_NAME}) {
  background-color: rgb(253 224 71);
  color: var(--background);
}
`;

type CSSWithHighlights = typeof CSS & {
  highlights?: Map<string, Highlight>;
};

function clearHighlights() {
  const highlights = (CSS as CSSWithHighlights).highlights;
  highlights?.delete(HIGHLIGHT_NAME);
  highlights?.delete(ACTIVE_HIGHLIGHT_NAME);
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
  activeMatchIndex = null,
  highlightAllMatchesYellow = false,
  onMatchCountChange,
  searchWords,
}: {
  activeMatchIndex?: number | null;
  highlightAllMatchesYellow?: boolean;
  onMatchCountChange?(count: number): void;
  searchWords: string[];
}) {
  const [editor] = useLexicalComposerContext();
  const shouldScrollRef = useRef(true);

  useEffect(() => {
    return editor.registerRootListener((root, prevRoot) => {
      if (prevRoot) {
        prevRoot.removeEventListener("focusin", handleFocusIn);
        prevRoot.removeEventListener("focusout", handleFocusOut);
      }

      if (root) {
        root.addEventListener("focusin", handleFocusIn);
        root.addEventListener("focusout", handleFocusOut);

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

  useEffect(() => {
    const highlights = (CSS as CSSWithHighlights).highlights;
    if (!highlights) {
      onMatchCountChange?.(0);
      return;
    }

    shouldScrollRef.current = true;
    const root = editor.getRootElement();
    getOrCreateStyleElement().textContent =
      root?.contains(document.activeElement) ? "" : HIGHLIGHT_STYLES;

    if (searchWords.length === 0) {
      clearHighlights();
      onMatchCountChange?.(0);
      return;
    }

    const apply = () => {
      const currentRoot = editor.getRootElement();
      if (!currentRoot) {
        clearHighlights();
        onMatchCountChange?.(0);
        return;
      }

      const escaped = searchWords.map((word) =>
        word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      );
      const regex = new RegExp(`(${escaped.join("|")})`, "gi");
      const ranges: Range[] = [];
      const walker = document.createTreeWalker(
        currentRoot,
        NodeFilter.SHOW_TEXT,
      );

      let textNode: Text | null;
      while ((textNode = walker.nextNode() as Text | null)) {
        const text = textNode.textContent || "";
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
          const range = document.createRange();
          range.setStart(textNode, match.index);
          range.setEnd(textNode, match.index + match[0].length);
          ranges.push(range);
        }
      }

      onMatchCountChange?.(ranges.length);
      if (ranges.length === 0) {
        clearHighlights();
        return;
      }

      if (highlightAllMatchesYellow) {
        highlights.delete(HIGHLIGHT_NAME);
        highlights.set(ACTIVE_HIGHLIGHT_NAME, new Highlight(...ranges));
      } else {
      const hasActiveMatch =
        activeMatchIndex !== null &&
        activeMatchIndex >= 0 &&
        activeMatchIndex < ranges.length;
        const inactiveRanges = hasActiveMatch
          ? ranges.filter((_, index) => index !== activeMatchIndex)
          : ranges;

        if (inactiveRanges.length > 0) {
          highlights.set(HIGHLIGHT_NAME, new Highlight(...inactiveRanges));
        } else {
          highlights.delete(HIGHLIGHT_NAME);
        }

        if (hasActiveMatch) {
          highlights.set(
            ACTIVE_HIGHLIGHT_NAME,
            new Highlight(ranges[activeMatchIndex]),
          );
        } else {
          highlights.delete(ACTIVE_HIGHLIGHT_NAME);
        }
      }

      if (!shouldScrollRef.current) {
        return;
      }

      shouldScrollRef.current = false;
      const hasActiveMatch =
        !highlightAllMatchesYellow &&
        activeMatchIndex !== null &&
        activeMatchIndex >= 0 &&
        activeMatchIndex < ranges.length;
      const targetRange = hasActiveMatch ? ranges[activeMatchIndex] : ranges[0];
      const scrollContainer = currentRoot.closest(
        "[data-editor-scroll-container]",
      );
      if (!scrollContainer) {
        return;
      }

      const scrollRect = scrollContainer.getBoundingClientRect();
      const targetRect = targetRange.getBoundingClientRect();
      const hasVisibleMatch =
        targetRect.bottom > scrollRect.top && targetRect.top < scrollRect.bottom;

      if (hasVisibleMatch) {
        return;
      }

      const scrollTop =
        scrollContainer.scrollTop +
        targetRect.top -
        scrollRect.top -
        scrollRect.height / 3;
      scrollContainer.scrollTo({ top: scrollTop, behavior: "instant" });
    };

    apply();
    return editor.registerUpdateListener(() => {
      apply();
    });
  }, [
    activeMatchIndex,
    editor,
    highlightAllMatchesYellow,
    onMatchCountChange,
    searchWords,
  ]);

  useEffect(() => clearHighlights, []);

  return null;
}
