import { useEffect, useRef } from "react";

import { closeBrackets } from "@codemirror/autocomplete";
import {
  history,
  indentWithTab,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { bracketMatching, indentOnInput } from "@codemirror/language";
// import { defaultKeymap } from "@codemirror/commands";

import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  rectangularSelection,
} from "@codemirror/view";
import { Table } from "@lezer/markdown";
import { vim } from "@replit/codemirror-vim";
import richEditor from "~/lib/codemirror-rich-editor";

import config from "./markdoc";
import TagInput from "./TagInput";

const theme = EditorView.theme({
  "&": {
    fontSize: "12pt",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "monospace",
    lineHeight: "2",
    caretColor: "white !important",
    border: "1px solid black", // very important you keep this border or the cursor disapears
  },
  ".cm-gutters": {
    // minHeight: "200px",
    backgroundColor: "transparent",
    borderRight: "transparent",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "yellow",
  },
  ".cm-scroller": {
    // overflow: "auto",
    // maxHeight: "100%",
    // backgroundColor: "blue",
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
  "&.cm-focused .cm-selectionBackground, & .cm-line::selection, & .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection":
    {
      background: "#656565 !important",
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

const Editor = () => {
  const editor = useRef<HTMLDivElement>(undefined!);

  useEffect(() => {
    const extensions = [
      highlightActiveLine(),
      keymap.of([{ key: "Enter", run: insertNewlineAndIndent }]),

      theme,
      richEditor({
        markdoc: config,
        lezer: {
          codeLanguages: languages,
          extensions: [Table],
        },
      }),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      // lineNumbers(),
      closeBrackets(),
      rectangularSelection(),
      // highlightActiveLine(),
      crosshairCursor(),
      // highlightActiveLineGutter(),
      // scrollPastEnd(),
      vim(),
      keymap.of([indentWithTab]),

      EditorView.lineWrapping,

      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
    ];

    const startState = EditorState.create({
      doc: "# Hello World\n\nThis is a test of the markdown editor\n**bold** *italic* `code`",
      extensions,
    });

    const view = new EditorView({ state: startState, parent: editor.current });

    return () => {
      view.destroy();
    };
  }, []);

  return (
    <div className="flex h-full flex-col pt-11">
      <div className="h-full overflow-auto">
        <div className="h-full w-full" ref={editor}></div>
      </div>
      <TagInput />
    </div>
  );
};

export default Editor;
