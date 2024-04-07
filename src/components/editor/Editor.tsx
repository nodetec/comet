import { useEffect, useRef } from "react";

import {
  closeBrackets,
} from "@codemirror/autocomplete";
import { history } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  indentOnInput,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  rectangularSelection,
} from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { EditorView } from "codemirror";

import { darkTheme, lightTheme } from "./editor-themes";
import useThemeChange from "~/hooks/useThemeChange";
import { useGlobalState } from "~/store";
import type { ChangeEvent } from 'react'
// import { useCountdown } from 'usehooks-ts'

export const Editor = () => {
  const editor = useRef();

  const { setActiveNote, activeNote } = useGlobalState();


  const theme = useThemeChange();

  // const handleSaveNote = (event: ChangeEvent<HTMLInputElement>) => {
  //   setActiveNote(event.target.value)
  // }

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
        // highlightActiveLine(),
        // highlightSelectionMatches(),

        EditorView.lineWrapping,
        EditorView.domEventHandlers({
          blur: (event, view: EditorView) => {
          }
        }),
        EditorView.updateListener.of(update => {
          if(update.focusChanged){

          }
          if(update.docChanged){
            if(activeNote){
              activeNote.content = update.state.doc.toString()
              setActiveNote(activeNote)
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
      parent: editor.current,
    });

    // const cm = getCM(view);
    // Vim.map("U", "u", "normal"); // in insert mode

    return () => {
      view.destroy();
    };
  }, [theme, activeNote]);

  return <div className="h-full overflow-y-auto px-4" ref={editor}></div>;
};

export default Editor;
