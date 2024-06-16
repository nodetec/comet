import { useEffect, useRef, useState } from "react";

import { closeBrackets } from "@codemirror/autocomplete";
import { history, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  // scrollPastEnd,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { useQueryClient } from "@tanstack/react-query";
import { getNote, updateNote } from "~/api";
import useThemeChange from "~/hooks/useThemeChange";
import {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
} from "~/lib/editor/compartments";
import {
  customizeEditorThemeStyles,
  indentUnitWhitespace,
} from "~/lib/editor/utils";
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

  const { filter, currentNote, settings } = useAppContext();

  const queryClient = useQueryClient();

  const preferredTheme = useThemeChange();

  async function handleBlur(view: EditorView) {
    const content = currentNote?.content;
    const id = currentNote?.id;
    if (id === undefined || content === undefined) {
      return;
    }
    const response = await getNote(id);
    if (response.data.content !== view.state.doc.toString()) {
      void updateNote({ id, content: view.state.doc.toString() });
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
    }
  }

  const blurHandlerExtension = EditorView.domEventHandlers({
    blur: (_, view) => {
      void handleBlur(view);
      return false; // Return false if you don't want to prevent the default behavior
    },
  });

  useEffect(() => {
    if (!editorRef.current) return;

    let theme;
    if (preferredTheme === "dark") {
      theme = darkTheme;
    } else {
      theme = lightTheme;
    }

    const extensions = [
      theme,
      fontSize.of(theme),
      fontFamily.of(theme),
      fontWeight.of(theme),
      lineHeight.of(theme),
      blurHandlerExtension,
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
      keymap.of([indentWithTab]),
      EditorState.tabSize.of(Number(settings.tab_size)),
      EditorState.readOnly.of(filter === "archived" || filter === "trashed"),
      EditorView.updateListener.of((update) => {
        if (
          update.changes &&
          currentNote?.content !== update.state.doc.toString()
        ) {
          onChange(update.state.doc.toString());
        }
      }),

      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      indentUnit.of(indentUnitWhitespace(settings.indent_unit)),
    ];

    if (settings.vim === "true") {
      extensions.push(vim());
    }
    if (settings.line_numbers === "true") {
      extensions.push(lineNumbers());
    }
    if (settings.highlight_active_line === "true") {
      extensions.push(highlightActiveLine());
    }
    if (settings.line_wrapping === "true") {
      extensions.push(EditorView.lineWrapping);
    }

    const initialState = EditorState.create({
      doc: initialDoc,
      extensions,
    });

    const view = new EditorView({
      state: initialState,
      parent: editorRef.current,
    });

    customizeEditorThemeStyles(view, fontSize, "fontSize", settings.font_size);
    customizeEditorThemeStyles(
      view,
      fontFamily,
      "fontFamily",
      settings.font_family,
    );
    customizeEditorThemeStyles(
      view,
      fontWeight,
      "fontWeight",
      settings.font_weight,
    );
    customizeEditorThemeStyles(
      view,
      lineHeight,
      "lineHeight",
      settings.line_height,
    );

    setEditorView(view);

    return () => {
      view.destroy();
    };
  }, [preferredTheme, currentNote?.id]);

  return { editorRef, editorView };
};
