import { useEffect, useRef, useState } from "react";

import { closeBrackets } from "@codemirror/autocomplete";
import { history } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  rectangularSelection,
  // scrollPastEnd,
} from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { useQueryClient } from "@tanstack/react-query";
import { updateNote } from "~/api";
import useThemeChange from "~/hooks/useThemeChange";
import { useAppContext } from "~/store";
import { EditorView } from "codemirror";

import { darkTheme, lightTheme } from "../components/editor/editor-themes";

interface Props {
  initialDoc: string;
  onChange: (state: string) => void;
}

export const useCM6Editor = ({ initialDoc, onChange }: Props) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorView, setEditorView] = useState<EditorView>();

  const { filter, currentNote, setCurrentNote } = useAppContext();

  const queryClient = useQueryClient();
  const data = queryClient.getQueryData(["notes", { search: false }]);

  const theme = useThemeChange();
  useEffect(() => {
    if (!editorRef.current) return;

    const startState = EditorState.create({
      // doc: currentNote?.content ?? currentTrashedNote?.content,
      doc: initialDoc,
      extensions: [
        theme === "dark" ? darkTheme : lightTheme,
        vim(),
        // lineNumbers(),
        // highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        // foldGutter(),
        drawSelection(),
        dropCursor(),
        // EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        // syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        // autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        // scrollPastEnd(),
        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          blur: (event, view: EditorView) => {
            const content = currentNote?.content;
            const id = currentNote?.id;
            if (id === undefined || content === undefined) {
              return;
            }
            updateNote({ id, content });
          },
        }),
        EditorState.readOnly.of(filter === "archived" || filter === "trashed"),
        EditorView.updateListener.of((update) => {
          if (update.changes && currentNote?.content !== update.state.doc.toString()) {
            onChange(update.state.doc.toString());
          }
        }),

        // basicSetup,
        markdown({
          base: markdownLanguage,
          codeLanguages: languages,
          // addKeymap: true,
        }),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });
    setEditorView(view);

    return () => {
      view.destroy();
    };
  }, [theme, currentNote, setCurrentNote]);

  return { editorRef, editorView };
};
