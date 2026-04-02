import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export { HighlightSyntax } from "@/features/editor/extensions/markdown-decorations/highlight-syntax";
import { tables } from "@/features/editor/extensions/markdown-decorations/builders/tables";
import { lists } from "@/features/editor/extensions/markdown-decorations/lists";
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
    fontSize: "1.05em",
    lineHeight: "1.45",
  },
  ".cm-md-h6": {
    fontSize: "1.0em",
    lineHeight: "1.45",
  },
  ".cm-md-strong": {
    fontWeight: "700",
  },
  ".cm-md-emphasis": {
    fontStyle: "italic",
  },
  ".cm-md-code": {
    color: "var(--foreground)",
    fontFamily:
      '"SF Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: "0.9em",
    backgroundColor: "var(--muted)",
    borderRadius: "0.2rem",
    padding: "0.1em 0.2em",
  },
  ".cm-md-codeblock": {
    fontFamily:
      '"SF Mono", "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: "0.9em",
    backgroundColor: "var(--muted)",
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
  ".cm-md-codeblock-fence-hidden": {
    opacity: "0",
  },
  ".cm-md-table-wrapper": {
    paddingBlock: "0.4rem",
    overflowX: "auto",
  },
  ".cm-md-table": {
    borderCollapse: "separate",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    borderSpacing: "0",
    fontSize: "0.95em",
    overflow: "hidden",
    minWidth: "100%",
    tableLayout: "auto",
    width: "max-content",
  },
  ".cm-md-table th, .cm-md-table td": {
    borderBottom: "1px solid var(--border)",
    borderRight: "1px solid var(--border)",
    maxWidth: "18rem",
    minWidth: "8rem",
    padding: "0.45rem 0.6rem",
    verticalAlign: "top",
  },
  ".cm-md-table tr:last-child > th, .cm-md-table tr:last-child > td": {
    borderBottom: "none",
  },
  ".cm-md-table th:last-child, .cm-md-table td:last-child": {
    borderRight: "none",
  },
  ".cm-md-table-cell": {
    cursor: "text",
    position: "relative",
  },
  ".cm-md-table-cell-selected": {
    backgroundColor: "color-mix(in oklab, var(--primary) 16%, transparent)",
  },
  ".cm-md-table-cell-content, .cm-md-table-cell-editor": {
    minHeight: "1.5rem",
    overflowWrap: "break-word",
    paddingInlineEnd: "1.35rem",
    whiteSpace: "pre-wrap",
  },
  ".cm-md-table-cell-menu-trigger": {
    alignItems: "center",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-xs)",
    color: "var(--muted-foreground)",
    cursor: "pointer",
    display: "inline-flex",
    height: "1.1rem",
    insetInlineEnd: "0.2rem",
    justifyContent: "center",
    lineHeight: "1",
    opacity: "0",
    padding: "0",
    position: "absolute",
    top: "0.2rem",
    transition:
      "opacity 120ms ease, background-color 120ms ease, color 120ms ease",
    width: "1.1rem",
  },
  ".cm-md-table-cell:hover .cm-md-table-cell-menu-trigger, .cm-md-table-cell-menu-trigger:focus-visible":
    {
      opacity: "1",
    },
  ".cm-md-table-cell-menu-trigger:hover": {
    backgroundColor: "color-mix(in oklab, var(--muted) 75%, transparent)",
    color: "var(--foreground)",
  },
  ".cm-md-table-input": {
    background: "transparent",
    border: "none",
    color: "inherit",
    font: "inherit",
    margin: "0",
    outline: "none",
    padding: "0",
    width: "100%",
  },
  ".cm-md-table th": {
    backgroundColor: "color-mix(in oklab, var(--muted) 65%, transparent)",
    fontWeight: "600",
    textAlign: "left",
  },
  '.cm-md-table [data-align="center"]': {
    textAlign: "center",
  },
  '.cm-md-table [data-align="right"]': {
    textAlign: "right",
  },
  ".cm-md-link": {
    color: "var(--primary)",
  },
  ".cm-md-bq": {
    backgroundRepeat: "no-repeat",
  },
  ".cm-md-bq-1": {
    paddingLeft: "1.5em",
    backgroundImage: "linear-gradient(var(--primary),var(--primary))",
    backgroundSize: "2px 100%",
    backgroundPosition: "0.5em 0",
  },
  ".cm-md-bq-2": {
    paddingLeft: "2.5em",
    backgroundImage:
      "linear-gradient(var(--primary),var(--primary)),linear-gradient(var(--primary),var(--primary))",
    backgroundSize: "2px 100%,2px 100%",
    backgroundPosition: "0.5em 0,1.5em 0",
  },
  ".cm-md-bq-3": {
    paddingLeft: "3.5em",
    backgroundImage:
      "linear-gradient(var(--primary),var(--primary)),linear-gradient(var(--primary),var(--primary)),linear-gradient(var(--primary),var(--primary))",
    backgroundSize: "2px 100%,2px 100%,2px 100%",
    backgroundPosition: "0.5em 0,1.5em 0,2.5em 0",
  },
  ".cm-md-bq-4": {
    paddingLeft: "4.5em",
    backgroundImage:
      "linear-gradient(var(--primary),var(--primary)),linear-gradient(var(--primary),var(--primary)),linear-gradient(var(--primary),var(--primary)),linear-gradient(var(--primary),var(--primary))",
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
  ".cm-md-hr": {
    display: "inline-block",
    height: "1em",
    lineHeight: "1em",
    marginBlock: "-0.35em",
    paddingBlock: "0.35em",
    position: "relative",
    verticalAlign: "middle",
    width: "100%",
  },
  ".cm-md-hr::before": {
    borderTop: "1px solid var(--border)",
    content: '""',
    left: "0",
    position: "absolute",
    right: "0",
    top: "calc(50% + 1px)",
    transform: "translateY(-50%)",
  },
});

export function markdownDecorations(): Extension {
  return [
    markdownDecorationsPlugin,
    markdownDecorationsTheme,
    lists(),
    tables(),
  ];
}
