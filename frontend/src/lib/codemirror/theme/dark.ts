import { EditorView } from "@codemirror/view";

const darkTheme = EditorView.theme({
  "&": {
    fontSize: "12pt",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "monospace",
    lineHeight: "2",
    caretColor: "white !important",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    borderRight: "transparent",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "yellow",
  },
  ".cm-scroller": {
    height: "100%",
  },
  ".cm-activeLine": {
    backgroundColor: "#151515",
  },
  ".cm-fat-cursor": {
    position: "absolute",
    background: `white !important`,
    border: "none",
    whiteSpace: "pre",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "white !important",
  },
  "&:not(.cm-focused) .cm-fat-cursor": {
    background: "none !important",
    outline: `solid 1px white !important`,
    color: "transparent !important",
  },
  ".cm-vimMode .cm-line, & ::selection, &::selection": {
    caretColor: "transparent !important",
  },
  "&.cm-focused": {
    outline: "none",
  },
  "&.cm-focused .cm-selectionBackground, & .cm-line::selection, & .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection":
    {
      backgroundColor: "#151515 !important",
      // background: "red"
    },
  "& .cm-selectionMatch": {
    backgroundColor: "#ffcc00",
  },
  ".cm-panels .cm-panels-bottom": {
    background: "#252525 !important",
    height: "100%",
  },
});

export default darkTheme;
