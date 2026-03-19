import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { createLinkMatcherWithRegExp, registerAutoLink } from "@lexical/link";

const EMAIL_LINK_MATCHER = createLinkMatcherWithRegExp(
  /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/,
  (text) => `mailto:${text}`,
);

export default function AutoLinkPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return registerAutoLink(editor, {
      changeHandlers: [],
      excludeParents: [],
      matchers: [EMAIL_LINK_MATCHER],
    });
  }, [editor]);

  return null;
}
