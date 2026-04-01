import { type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

export { HighlightSyntax } from "@/features/editor/extensions/markdown-decorations/highlight-syntax";
import {
  dedentListItem,
  indentListItem,
} from "@/features/editor/extensions/markdown-decorations/list-keymap";
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
  ".cm-md-codeblock": {
    fontFamily:
      '"SF Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: "0.9em",
    backgroundColor: "color-mix(in oklab, var(--muted) 50%, transparent)",
    padding: "0 0.75rem",
  },
  ".cm-md-codeblock.cm-md-codeblock-open": {
    borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
    paddingTop: "0.5rem",
  },
  ".cm-md-codeblock.cm-md-codeblock-close": {
    borderRadius: "0 0 var(--radius-sm) var(--radius-sm)",
    paddingBottom: "0.5rem",
  },
  ".cm-md-link": {
    color: "var(--syntax-link)",
    textDecoration: "underline",
    textUnderlineOffset: "0.15em",
  },
  ".cm-md-bq": {
    backgroundRepeat: "no-repeat",
  },
  ".cm-md-bq-1": {
    paddingLeft: "1.5em",
    backgroundImage:
      "linear-gradient(var(--blockquote-accent),var(--blockquote-accent))",
    backgroundSize: "2px 100%",
    backgroundPosition: "0.5em 0",
  },
  ".cm-md-bq-2": {
    paddingLeft: "2.5em",
    backgroundImage:
      "linear-gradient(var(--blockquote-accent),var(--blockquote-accent)),linear-gradient(var(--blockquote-accent),var(--blockquote-accent))",
    backgroundSize: "2px 100%,2px 100%",
    backgroundPosition: "0.5em 0,1.5em 0",
  },
  ".cm-md-bq-3": {
    paddingLeft: "3.5em",
    backgroundImage:
      "linear-gradient(var(--blockquote-accent),var(--blockquote-accent)),linear-gradient(var(--blockquote-accent),var(--blockquote-accent)),linear-gradient(var(--blockquote-accent),var(--blockquote-accent))",
    backgroundSize: "2px 100%,2px 100%,2px 100%",
    backgroundPosition: "0.5em 0,1.5em 0,2.5em 0",
  },
  ".cm-md-bq-4": {
    paddingLeft: "4.5em",
    backgroundImage:
      "linear-gradient(var(--blockquote-accent),var(--blockquote-accent)),linear-gradient(var(--blockquote-accent),var(--blockquote-accent)),linear-gradient(var(--blockquote-accent),var(--blockquote-accent)),linear-gradient(var(--blockquote-accent),var(--blockquote-accent))",
    backgroundSize: "2px 100%,2px 100%,2px 100%,2px 100%",
    backgroundPosition: "0.5em 0,1.5em 0,2.5em 0,3.5em 0",
  },
  ".cm-md-highlight": {
    backgroundColor: "var(--markdown-highlight)",
    color: "var(--markdown-highlight-foreground)",
    borderRadius: "0.2rem",
    padding: "0 0.08rem",
    boxDecorationBreak: "clone",
  },
  ".cm-md-strikethrough": {
    textDecoration: "line-through",
  },
  ".cm-md-indent": {
    display: "inline-flex",
    width: "2rem",
  },
  ".cm-md-list": {
    paddingLeft: "calc(var(--indent-level) * 2rem + 2rem) !important",
    position: "relative",
    textIndent: "calc((var(--indent-level) * 2rem + 2rem) * -1)",
  },
  ".cm-md-list *": {
    textIndent: "0",
  },
  ".cm-md-list-marker": {
    alignItems: "center",
    color: "var(--muted-foreground)",
    display: "inline-flex",
    justifyContent: "center",
    minWidth: "2rem",
  },
  ".cm-md-number-marker": {
    fontVariantNumeric: "tabular-nums",
    fontSize: "0.9em",
  },
  ".cm-md-task-marker": {
    cursor: "pointer",
    margin: "0",
    scale: "1.2",
    transformOrigin: "center center",
  },
  ".cm-md-task-list.cm-md-task-checked": {
    textDecoration: "line-through",
    textDecorationColor: "var(--muted-foreground)",
  },
  ".cm-md-hr": {
    border: "none",
    borderTop: "1px solid var(--border)",
    display: "block",
    margin: "0.5em 0",
  },
});

const listKeymap = Prec.high(
  keymap.of([
    { key: "Tab", run: indentListItem },
    { key: "Shift-Tab", run: dedentListItem },
  ]),
);

export function markdownDecorations(): Extension {
  return [markdownDecorationsPlugin, markdownDecorationsTheme, listKeymap];
}
