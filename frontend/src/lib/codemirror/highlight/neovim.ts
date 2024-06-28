import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

const neovimHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: "#9b9ea4", fontStyle: "italic" },
  { tag: t.lineComment, color: "#9b9ea4", fontStyle: "italic" },
  { tag: t.blockComment, color: "#9b9ea4", fontStyle: "italic" },
  { tag: t.docComment, color: "#9b9ea4", fontStyle: "italic" },
  { tag: t.name, color: "#e0e2ea" },
  { tag: t.variableName, color: "#e0e2ea" },
  { tag: t.typeName, color: "#8cf8f7" },
  { tag: t.function(t.variableName), color: "#a6dbff" },
  { tag: t.className, color: "#8cf8f7" },
  { tag: t.string, color: "#b3f6c0" },
  { tag: t.keyword, color: "#e1af69" },
  { tag: t.local(t.typeName), color: "#e1af69" },
  { tag: t.bool, color: "#bb99f7" },
  { tag: t.number, color: "#bb99f7" },
  { tag: t.null, color: "#bb99f7" },
  { tag: t.namespace, color: "#8cf8f7" },
  { tag: t.propertyName, color: "#a6dbff" },
  { tag: t.url, color: "#7ccdfd" },
  { tag: t.link, color: "#7ccdfd" },
  { tag: t.meta, color: "#9b9ea4" },

  {
    tag: t.heading1,
    fontWeight: "bold",
    fontFamily: "monospace",
    fontSize: "1.5rem",
    textDecoration: "none",
  },
  {
    tag: t.heading2,
    fontWeight: "bold",
    fontFamily: "monospace",
    fontSize: "1.2rem",
    textDecoration: "none",
  },
  {
    tag: t.heading3,
    fontWeight: "bold",
    fontFamily: "monospace",
    fontSize: "1.2rem",
    textDecoration: "none",
  },
  {
    tag: t.heading4,
    fontWeight: "bold",
    fontFamily: "monospace",
    fontSize: "1.2rem",
    textDecoration: "none",
  },
  {
    tag: t.heading5,
    fontWeight: "bold",
    fontFamily: "monospace",
    fontSize: "1.2rem",
    textDecoration: "none",
  },
  {
    tag: t.heading6,
    fontWeight: "bold",
    fontFamily: "monospace",
    fontSize: "1rem",
    textDecoration: "none",
  },
  { tag: t.emphasis, fontFamily: "monospace", fontStyle: "italic" },
  { tag: t.strong, fontFamily: "monospace", fontWeight: "bold" },
  { tag: t.monospace, fontFamily: "monospace", color: "#ffc0b9" },
  { tag: t.content, fontFamily: "monospace" },
]);

export default neovimHighlightStyle;
