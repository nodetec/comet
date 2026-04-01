import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export { HighlightSyntax } from "@/features/editor/extensions/markdown-decorations/highlight-syntax";
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
  ".cm-md-bullet": {
    display: "inline-block",
    width: "1.2em",
    color: "var(--primary)",
    textAlign: "center",
    fontWeight: "700",
    userSelect: "none",
  },
  ".cm-md-ordered-num": {
    display: "inline-block",
    minWidth: "1.5em",
    color: "var(--primary)",
    textAlign: "right",
    paddingRight: "0.3em",
    fontVariantNumeric: "tabular-nums",
    fontSize: "0.9em",
    whiteSpace: "nowrap",
    userSelect: "none",
  },
  ".cm-md-checkbox": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "16px",
    height: "16px",
    border: "1px solid var(--editor-checkbox-border, var(--border))",
    borderRadius: "4px",
    backgroundColor: "var(--background)",
    cursor: "pointer",
    verticalAlign: "-0.15em",
    marginRight: "6px",
    transition: "background-color 0.1s, border-color 0.1s",
    userSelect: "none",
    flexShrink: "0",
  },
  ".cm-md-checkbox:hover": {
    borderColor: "var(--primary)",
  },
  ".cm-md-checkbox-checked": {
    borderColor: "var(--primary)",
    backgroundColor: "var(--primary)",
    backgroundImage:
      "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3e%3cpath d='M20 6 9 17l-5-5'/%3e%3c/svg%3e\")",
    backgroundSize: "12px 12px",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  },
  ".cm-md-task-checked": {
    color: "var(--muted-foreground)",
    textDecoration: "line-through",
  },
  ".cm-md-hr": {
    border: "none",
    borderTop: "1px solid var(--border)",
    display: "block",
    margin: "0.5em 0",
  },
});

export function markdownDecorations(): Extension {
  return [markdownDecorationsPlugin, markdownDecorationsTheme];
}
