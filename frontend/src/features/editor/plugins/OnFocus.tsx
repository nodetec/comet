import { useEffect } from "react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  COMMAND_PRIORITY_EDITOR,
  FOCUS_COMMAND,
  type LexicalEditor,
} from "lexical";

export function OnFocusPlugin({
  onFocus,
}: {
  onFocus: (event: FocusEvent, editor: LexicalEditor) => void;
}): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.registerCommand(
      FOCUS_COMMAND,
      (event, editor) => {
        onFocus(event, editor);
        return true;
      },
      COMMAND_PRIORITY_EDITOR,
    );
  }, [editor, onFocus]);

  return null;
}
