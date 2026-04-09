import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { type MarkdownConfig } from "@lezer/markdown";

import { inlineImages } from "@/features/editor/extensions/inline-images";
import { markdownDecorations } from "@/features/editor/extensions/markdown-decorations";

export const MARKDOWN_HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: [t.emphasis], fontStyle: "italic" },
  { tag: [t.strong], fontWeight: "700" },
  {
    tag: [t.monospace, t.literal],
    fontFamily:
      '"SF Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  { tag: [t.link, t.url], color: "var(--primary)" },
  { tag: [t.quote], color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [t.comment], color: "var(--syntax-comment)" },
  {
    tag: [t.keyword, t.operatorKeyword, t.controlKeyword, t.modifier],
    color: "var(--syntax-keyword)",
  },
  {
    tag: [t.typeName, t.className, t.namespace],
    color: "var(--syntax-type)",
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName],
    color: "var(--syntax-function)",
  },
  {
    tag: [t.propertyName, t.attributeName],
    color: "var(--syntax-attribute)",
  },
  {
    tag: [t.number, t.integer, t.float],
    color: "var(--syntax-number)",
  },
  {
    tag: [t.string, t.special(t.string)],
    color: "var(--syntax-string)",
  },
  { tag: [t.regexp], color: "var(--syntax-regex)" },
  {
    tag: [t.bool, t.null, t.atom, t.labelName, t.constant(t.name)],
    color: "var(--syntax-constant)",
  },
  {
    tag: [t.tagName, t.special(t.tagName)],
    color: "var(--syntax-selector)",
  },
  { tag: [t.meta], color: "var(--syntax-atrule)" },
  { tag: [t.processingInstruction], color: "var(--muted-foreground)" },
  { tag: [t.contentSeparator], color: "var(--muted-foreground)" },
]);

export const MARKDOWN_EDITOR_THEME = EditorView.theme({
  "&": {
    minHeight: "100%",
    background: "transparent",
    cursor: "text",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    minHeight: "100%",
    overflow: "visible",
    fontFamily: '"Figtree Variable", sans-serif',
    cursor: "text",
  },
  ".cm-content": {
    minHeight: "100%",
    color: "var(--editor-text)",
    caretColor: "var(--editor-caret)",
    cursor: "text",
  },
  ".cm-line": {
    paddingBlock: "0",
    paddingLeft: "0",
    paddingRight: "0",
    cursor: "text",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--editor-caret)",
    borderLeftWidth: "1.5px",
  },
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent)",
  },
  ".cm-selectionLayer": {
    zIndex: "1 !important",
    pointerEvents: "none",
    // Override baseTheme's `contain: size style` so the layer can be
    // stretched by the bottom/right offsets, giving clip-path a real
    // reference box to clip selection backgrounds out of the padding.
    contain: "style",
    bottom: "0",
    right: "0",
    clipPath:
      "inset(0 max(clamp(1rem, 5vw, 3.5rem), calc((100% - 42rem) / 2)))",
  },
  ".cm-cursorLayer": {
    zIndex: "2 !important",
  },
  // Keep inactive styling scoped to the root editor so nested table editors
  // can still render their own caret while the main editor host is inactive.
  "&.comet-editor-inactive > .cm-scroller > .cm-content": {
    caretColor: "transparent",
  },
  "&.comet-editor-inactive > .cm-scroller > .cm-cursorLayer": {
    opacity: "0",
  },
  "&.comet-editor-inactive > .cm-scroller > .cm-selectionLayer .cm-selectionBackground":
    {
      backgroundColor: "transparent",
    },
  ".cm-tooltip": {
    border: "1px solid var(--border)",
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    borderRadius: "calc(var(--radius) - 2px)",
    boxShadow:
      "0 16px 40px color-mix(in oklab, var(--shadow-color) 18%, transparent)",
    overflow: "hidden",
  },
  "&.cm-focused .cm-content ::selection": {
    backgroundColor: "transparent !important",
  },
});

export const AUTOCOMPLETE_MENU_THEME = EditorView.theme({
  ".cm-tooltip.cm-tooltip-autocomplete": {
    borderRadius: "calc(var(--radius) + 6px)",
    "& .cm-tag-completion-icon-wrap": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "0.875rem",
      flexShrink: 0,
      color: "var(--muted-foreground)",
    },
    "& .cm-tag-completion-icon": {
      width: "0.875rem",
      height: "0.875rem",
      display: "block",
    },
    "& .cm-note-completion-icon-wrap": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "0.875rem",
      flexShrink: 0,
      color: "var(--muted-foreground)",
    },
    "& .cm-note-completion-icon": {
      width: "0.875rem",
      height: "0.875rem",
      display: "block",
    },
    "& .cm-completionLabel": {
      display: "block",
      minWidth: 0,
    },
    "& .cm-completionMatchedText": {
      textDecoration: "none",
      color: "var(--autocomplete-match)",
      fontWeight: "600",
    },
    "& > ul": {
      minWidth: "100px",
      padding: "0.5rem",
      fontFamily: '"Geist Variable", sans-serif',
      fontSize: "0.8125rem",
      lineHeight: "1.35",
      scrollPaddingBlock: "0.5rem",
    },
    "& > ul > li": {
      display: "flex",
      alignItems: "center",
      gap: "0.45rem",
      borderRadius: "calc(var(--radius) + 2px)",
      padding: "0.375rem 0.5rem",
      scrollMarginBlock: "0.5rem",
    },
    "& > ul > li[aria-selected]": {
      backgroundColor: "var(--accent)",
      color: "var(--accent-foreground)",
    },
    "& > ul > li[aria-selected] .cm-tag-completion-icon-wrap, & > ul > li[aria-selected] .cm-note-completion-icon-wrap":
      {
        color: "var(--primary)",
      },
  },
});

export const DISABLE_SETEXT_HEADING: MarkdownConfig = {
  parseBlock: [
    {
      name: "SetextHeading",
      parse() {
        return false;
      },
    },
  ],
};

export function buildSearchAwarePresentationExtensions(
  searchQuery: string,
  noteId: string | null,
) {
  return [
    inlineImages({ searchQuery }),
    markdownDecorations({ noteId, searchQuery }),
  ];
}
