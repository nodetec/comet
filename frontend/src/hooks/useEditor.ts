import { useEffect, useRef, useState } from "react";

import { closeBrackets } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  indentWithTab,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
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
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  NoteService,
  SettingService,
} from "&/github.com/nodetec/captains-log/service";
import neovimHighlightStyle from "~/lib/codemirror/highlight/neovim";
import {
  fontFamily,
  fontSize,
  lineHeight,
} from "~/lib/codemirror/text/compartments";
import {
  customizeEditorThemeStyles,
  indentUnitWhitespace,
} from "~/lib/codemirror/text/styles";
import darkTheme from "~/lib/codemirror/theme/dark";
import { parseTitle } from "~/lib/markdown";
import { useAppState } from "~/store";
import { EditorView } from "codemirror";

interface Props {
  initialDoc: string;
  onChange: (state: string) => void;
}

export const useEditor = ({ initialDoc, onChange }: Props) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorView, setEditorView] = useState<EditorView>();

  const activeNote = useAppState((state) => state.activeNote);
  const activeTrashNote = useAppState((state) => state.activeTrashNote);
  const feedType = useAppState((state) => state.feedType);
  const queryClient = useQueryClient();

  async function fetchSettings() {
    const settings = await SettingService.GetAllSettings();
    return settings;
  }

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => fetchSettings(),
  });

  let timeoutId: NodeJS.Timeout;

  const saveDocument = async (view: EditorView) => {
    const content = activeNote?.Content;
    const id = activeNote?.ID;
    if (activeNote === undefined || id === undefined || content === undefined) {
      return;
    }
    const note = await NoteService.GetNote(id);
    if (note.Content !== view.state.doc.toString()) {
      void NoteService.UpdateNote(
        id,
        parseTitle(view.state.doc.toString()),
        view.state.doc.toString(),
        activeNote.NotebookID,
        activeNote.StatusID,
        // TODO: rethink published indicator
        false,
        activeNote.EventID,
        activeNote.Pinned,
        activeNote.Notetype,
        activeNote.Filetype,
      );
      console.log("SAVING TO DB");
    }
  };

  const blurHandlerExtension = EditorView.domEventHandlers({
    blur: (_, view) => {
      void saveDocument(view);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      return false;
    },
  });

  useEffect(() => {
    if (!editorRef.current) return;

    const extensions = [
      syntaxHighlighting(neovimHighlightStyle),
      keymap.of(defaultKeymap),
      keymap.of([{ key: "Enter", run: insertNewlineAndIndent }, indentWithTab]),
      darkTheme,
      fontSize.of(darkTheme),
      fontFamily.of(darkTheme),
      lineHeight.of(darkTheme),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      EditorState.readOnly.of(feedType === "trash" ? true : false),
      keymap.of([indentWithTab]),
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      indentUnit.of(indentUnitWhitespace(settings?.IndentSpaces)),
      blurHandlerExtension,
      EditorView.updateListener.of((update) => {
        if (
          update.changes &&
          activeNote?.Content !== update.state.doc.toString()
        ) {
          onChange(update.state.doc.toString());
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => saveDocument(update.view), 500);
        }
      }),
    ];

    // NOTE
    // vim needs to be included before other keymaps in extensions
    // drawSelection also needs to be in extensions if basicSetup isn't being used
    if (settings?.Vim === "true") {
      extensions.unshift(vim());
    }

    if (settings?.LineNumbers === "true") {
      extensions.push(lineNumbers());
    }

    if (settings?.HighlightActiveLine === "true") {
      extensions.push(highlightActiveLine());
    }

    if (settings?.LineWrapping === "true") {
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

    customizeEditorThemeStyles(view, fontSize, "fontSize", settings?.FontSize);
    customizeEditorThemeStyles(
      view,
      fontFamily,
      "fontFamily",
      settings?.FontFamily,
    );
    customizeEditorThemeStyles(
      view,
      lineHeight,
      "lineHeight",
      settings?.LineHeight,
    );

    setEditorView(view);

    return () => {
      view.destroy();
      clearTimeout(timeoutId); // Clear timeout on cleanup
    };
  }, [activeNote?.ID, activeTrashNote?.ID, feedType, settings]);

  return { editorRef, editorView };
};
