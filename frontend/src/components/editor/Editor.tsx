import { useEffect, useRef } from "react";

import { closeBrackets } from "@codemirror/autocomplete";
import {
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
import neovimHighlightStyle from "~/lib/codemirror/highlight/neovim";
import darkTheme from "~/lib/codemirror/theme/dark";

import TagInput from "./TagInput";

// In your extensions...

const Editor = () => {
  const editor = useRef<HTMLDivElement>(undefined!);

  useEffect(() => {
    const extensions = [
      syntaxHighlighting(neovimHighlightStyle),
      highlightActiveLine(),
      keymap.of([{ key: "Enter", run: insertNewlineAndIndent }]),
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
      vim(),
      keymap.of([indentWithTab]),

      EditorView.lineWrapping,

      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
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

  return (
    <div className="flex h-full flex-col pt-11">
      <div className="h-full overflow-auto">
        <div className="h-full w-full px-4" ref={editor}></div>
      </div>
      <TagInput />
    </div>
  );
};

export default Editor;
