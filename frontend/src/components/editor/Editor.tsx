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
  syntaxHighlighting,
} from "@codemirror/language";
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
import { vim } from "@replit/codemirror-vim";
import { useQueryClient } from "@tanstack/react-query";
import { NullInt64, NullString } from "&/database/sql/models";
import { CreateNoteParams } from "&/github.com/nodetec/captains-log/db/models";
import neovimHighlightStyle from "~/lib/codemirror/highlight/neovim";
import darkTheme from "~/lib/codemirror/theme/dark";
import { parseTitle } from "~/lib/markdown";
import { SaveIcon } from "lucide-react";

import { NoteService } from "../../../bindings/github.com/nodetec/captains-log/service/";
import { Button } from "../ui/button";
import TagInput from "./TagInput";
import { useAppState } from "~/store";

const Editor = () => {
  const queryClient = useQueryClient();
  const editor = useRef<HTMLDivElement>(undefined!);
  const [content, setContent] = useState("");

  const onUpdate = EditorView.updateListener.of((view) => {
    setContent(view.state.doc.toString());
  });

  useEffect(() => {
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
      onUpdate,
    ];

    const startState = EditorState.create({
      doc: "# Hello World\n\nThis is a test of the markdown editor\n**bold** *italic* `code`\n\n```javascript\n// test comment\nconst x = 9;\n```",
      extensions,
    });

    const view = new EditorView({ state: startState, parent: editor.current });

    return () => {
      view.destroy();
    };
  }, []);

  async function handleSave(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    // console.log(editorView.current.state.doc.toString());
    const noteParams: CreateNoteParams = {
      StatusID: new NullInt64({ Int64: undefined, Valid: false }),
      NotebookID: new NullInt64({ Int64: undefined, Valid: false }),
      Content: content,
      Title: parseTitle(content).title,
      CreatedAt: new Date().toISOString(),
      ModifiedAt: new Date().toISOString(),
      PublishedAt: new NullString({ String: undefined, Valid: false }),
      EventID: new NullString({ String: undefined, Valid: false }),
    };

    const res = await NoteService.CreateNote(noteParams);

    void queryClient.invalidateQueries({
      queryKey: ["notes"],
    });
    console.log(res);
  }

  return (
    <div className="flex h-full flex-col pt-11">
      <div className="h-full overflow-auto">
        <div className="h-full w-full px-4" ref={editor}></div>
      </div>
      <div className="flex items-center justify-between">
        <TagInput />
        <Button
          onClick={handleSave}
          variant="ghost"
          size="icon"
          className="mr-2 text-muted-foreground"
        >
          <SaveIcon className="h-[1.2rem] w-[1.2rem]" />
        </Button>
      </div>
    </div>
  );
};

export default Editor;
