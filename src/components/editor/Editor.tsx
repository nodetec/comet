import { useEffect, useRef } from "react";

import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, Extension } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { getCM, vim, Vim } from "@replit/codemirror-vim";
import { DOC } from "~/lib/constants";
import { basicSetup, EditorView } from "codemirror";

import { darkTheme, lightTheme } from "./editor-themes";
import useThemeChange from "~/hooks/useThemeChange";

export const Editor = () => {
  const editor = useRef();

  const theme = useThemeChange();

  useEffect(() => {
    const startState = EditorState.create({
      doc: DOC,
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
  }, [theme]);

  return <div className="h-full overflow-y-auto px-4" ref={editor}></div>;
};

export default Editor;
