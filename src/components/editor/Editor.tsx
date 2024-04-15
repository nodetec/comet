import { useEffect, useRef } from "react";

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
import useThemeChange from "~/hooks/useThemeChange";
import { useGlobalState } from "~/store";
import { EditorView } from "codemirror";

import { darkTheme, lightTheme } from "./editor-themes";
import TagInput from "./TagInput";
import EditorControls from "./EditorControls";

export const Editor = () => {
  const editor = useRef<HTMLDivElement>(null);

  const { setActiveNote, activeNote } = useGlobalState();

  const theme = useThemeChange();
  useEffect(() => {
    const startState = EditorState.create({
      doc: activeNote?.content,
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
        // EditorView.domEventHandlers({
        //   blur: (event, view: EditorView) => {},
        // }),
        EditorView.updateListener.of((update) => {
          if (update.focusChanged) {
          }
          if (update.docChanged) {
            if (activeNote) {
              activeNote.content = update.state.doc.toString();
              setActiveNote(activeNote);
            }
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
      parent: editor.current!,
    });

    // const cm = getCM(view);
    // Vim.map("U", "u", "normal"); // in insert mode

    return () => {
      view.destroy();
    };
  }, [theme, activeNote, setActiveNote]);

  return (
    <>
      {activeNote && (
        <div className="flex h-full flex-col">
          <div
            className="editor-container h-full w-full overflow-y-auto"
            ref={editor}
          />
          <div className="flex items-center border-t border-muted">
            <TagInput />
            <EditorControls />
          </div>
        </div>
      )}
    </>
  );
};

export default Editor;
