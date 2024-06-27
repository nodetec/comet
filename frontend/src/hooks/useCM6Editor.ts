import { useEffect, useRef, useState } from "react";

import { closeBrackets } from "@codemirror/autocomplete";
import { history, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  keymap,
  // scrollPastEnd,
  rectangularSelection,
} from "@codemirror/view";
import { Table } from "@lezer/markdown";
import { vim } from "@replit/codemirror-vim";
import richEditor from "~/lib/codemirror-rich-editor";
import { EditorView } from "codemirror";

import config from './markdoc';

const Theme = EditorView.theme({
  "&": {
    fontSize: "12pt",
    // border: "1px solid #c0c0c0"
  },
  ".cm-content": {
    fontFamily: "monospace",
    lineHeight: "2",
  },
  ".cm-gutters": {
    minHeight: "200px"
  },
  ".cm-scroller": {
    overflow: "auto",
    maxHeight: "600px"
  }
});

export const useCM6Editor = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorView, setEditorView] = useState<EditorView>();

  useEffect(() => {
    if (!editorRef.current) return;

    const extensions = [
      Theme,
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
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      vim(),
      keymap.of([indentWithTab]),
      // EditorState.tabSize.of(Number(settings.tab_size)),
      // EditorState.readOnly.of(filter === "archived" || filter === "trashed"),
      // EditorView.updateListener.of((update) => {
      //   if (
      //     update.changes &&
      //     currentNote?.content !== update.state.doc.toString()
      //   ) {
      //     onChange(update.state.doc.toString());
      //   }
      // }),

      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      // indentUnit.of(indentUnitWhitespace(settings.indent_unit)),
    ];

    const initialState = EditorState.create({
      doc: "# test title \n`const x = 1;`\n**bold**\n*italic*",
      extensions,
    });

    const view = new EditorView({
      state: initialState,
      parent: editorRef.current,
    });

    setEditorView(view);

    return () => {
      view.destroy();
    };
  }, []);

  return { editorRef, editorView };
};
