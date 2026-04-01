import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { markdownDecorationsPlugin } from "@/features/editor/extensions/markdown-decorations/plugin";

const markdownDecorationsTheme = EditorView.baseTheme({
  ".cm-md-heading": {
    fontWeight: "700",
  },
  ".cm-md-h1": {
    fontSize: "1.75em",
    lineHeight: "1.25",
  },
  ".cm-md-h2": {
    fontSize: "1.45em",
    lineHeight: "1.3",
  },
  ".cm-md-h3": {
    fontSize: "1.25em",
    lineHeight: "1.35",
  },
  ".cm-md-h4": {
    fontSize: "1.1em",
    lineHeight: "1.4",
  },
  ".cm-md-h5": {
    fontSize: "1.0em",
    lineHeight: "1.45",
  },
  ".cm-md-h6": {
    fontSize: "0.925em",
    lineHeight: "1.45",
    color: "var(--muted-foreground)",
  },
  ".cm-md-strong": {
    fontWeight: "700",
  },
  ".cm-md-emphasis": {
    fontStyle: "italic",
  },
  ".cm-md-code": {
    fontFamily:
      '"SF Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: "0.9em",
    backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
    borderRadius: "0.2rem",
    padding: "0.1em 0.2em",
  },
  ".cm-md-link": {
    color: "var(--syntax-link)",
    textDecoration: "underline",
    textUnderlineOffset: "0.15em",
  },
  ".cm-md-blockquote": {
    borderLeft: "3px solid var(--blockquote-accent)",
    paddingLeft: "0.75em",
  },
  ".cm-md-strikethrough": {
    textDecoration: "line-through",
  },
  ".cm-md-hr": {
    border: "none",
    borderTop: "1px solid var(--border)",
    margin: "0.75em 0",
    display: "block",
  },
});

export function markdownDecorations(): Extension {
  return [markdownDecorationsPlugin, markdownDecorationsTheme];
}
