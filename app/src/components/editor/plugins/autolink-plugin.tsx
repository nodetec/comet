import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { registerAutoLink } from "@lexical/link";

import { AUTOLINK_MATCHERS } from "../lib/autolink";

export default function AutoLinkPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerAutoLink(editor, {
      changeHandlers: [],
      excludeParents: [],
      matchers: AUTOLINK_MATCHERS,
    });
  }, [editor]);

  return null;
}
