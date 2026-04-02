import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export { HighlightSyntax } from "@/features/editor/extensions/markdown-decorations/highlight-syntax";
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
  ".cm-md-codeblock-fence-hidden": {
    opacity: "0",
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
  return [markdownDecorationsPlugin, markdownDecorationsTheme, lists()];
}
