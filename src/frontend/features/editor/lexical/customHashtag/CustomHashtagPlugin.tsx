import { useCallback, useEffect } from "react";

import { $createHashtagNode, HashtagNode } from "@lexical/hashtag";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalTextEntity } from "@lexical/react/useLexicalTextEntity";
import { getHashtagRegexString } from "~/lib/markdown/getHashtagRegexString";
import type { TextNode } from "lexical";

const REGEX = new RegExp(getHashtagRegexString(), "i");

export function CustomHashtagPlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!editor.hasNodes([HashtagNode])) {
      throw new Error("HashtagPlugin: HashtagNode not registered on editor");
    }
  }, [editor]);

  const $createHashtagNode_ = useCallback((textNode: TextNode): HashtagNode => {
    return $createHashtagNode(textNode.getTextContent());
  }, []);

  const getHashtagMatch = useCallback((text: string) => {
    const matchArr = REGEX.exec(text);

    if (matchArr === null) {
      return null;
    }

    const hashtagLength = matchArr[3].length + 1;
    const startOffset = matchArr.index + matchArr[1].length;
    const endOffset = startOffset + hashtagLength;
    return {
      end: endOffset,
      start: startOffset,
    };
  }, []);

  useLexicalTextEntity<HashtagNode>(
    getHashtagMatch,
    HashtagNode,
    $createHashtagNode_,
  );

  return null;
}
