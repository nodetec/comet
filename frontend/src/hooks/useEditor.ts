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
  // indentUnit,
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
  // scrollPastEnd,
  // lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import { useQueryClient } from "@tanstack/react-query";
import { UpdateNoteParams } from "&/github.com/nodetec/captains-log/db/models";
// import { useQueryClient } from "@tanstack/react-query";
// import { NullInt64, NullString } from "&/database/sql/models";
// import { UpdateNoteParams } from "&/github.com/nodetec/captains-log/db/models";
import { NoteService } from "&/github.com/nodetec/captains-log/service";
import neovimHighlightStyle from "~/lib/codemirror/highlight/neovim";
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

  const { activeNote } = useAppState();

  const queryClient = useQueryClient();

  async function handleBlur(view: EditorView) {
    const content = activeNote?.Content;
    const id = activeNote?.ID;
    if (activeNote === undefined || id === undefined || content === undefined) {
      return;
    }
    const note = await NoteService.GetNote(id);
    if (note.Content !== view.state.doc.toString()) {
      const noteParams: UpdateNoteParams = {
        ID: id,
        StatusID: activeNote.StatusID,
        NotebookID: activeNote.NotebookID,
        Content: view.state.doc.toString(),
        Title: parseTitle(view.state.doc.toString()).title,
        ModifiedAt: new Date().toISOString(),
        PublishedAt: activeNote.PublishedAt,
        EventID: activeNote.EventID,
      };

      void NoteService.UpdateNote(noteParams);
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      console.log("SAVING TO DB ON BLUR");
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

    const extensions = [
      syntaxHighlighting(neovimHighlightStyle),
      highlightActiveLine(),
      vim(),
      keymap.of(defaultKeymap),
      keymap.of([{ key: "Enter", run: insertNewlineAndIndent }, indentWithTab]),
      darkTheme,
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
      keymap.of([indentWithTab]),
      EditorView.lineWrapping,
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      blurHandlerExtension,
      EditorView.updateListener.of((update) => {
        if (
          update.changes &&
          activeNote?.Content !== update.state.doc.toString()
        ) {
          onChange(update.state.doc.toString());
        }
      }),

      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
    ];

    const initialState = EditorState.create({
      doc: initialDoc,
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
  }, [activeNote?.ID]);

  return { editorRef, editorView };
};
