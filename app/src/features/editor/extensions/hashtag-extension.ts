import {
  $createTextNode,
  $isTextNode,
  defineExtension,
  IS_CODE,
  type LexicalEditor,
  type LexicalNode,
  TextNode,
} from "lexical";
import { $isCodeNode } from "@lexical/code";
import { mergeRegister } from "@lexical/utils";

import {
  $createHashtagNode,
  $isHashtagNode,
  HashtagNode,
} from "../nodes/hashtag-node";
import { findTagEntityMatch } from "../lib/tags";

function getHashtagMatch(text: string) {
  return findTagEntityMatch(text);
}

// ---------------------------------------------------------------------------
// Code-aware hashtag registration
//
// This is a fork of registerLexicalTextEntity from @lexical/text with an
// $isInsideCode guard added to both transforms. The upstream version has no
// way to skip nodes by context, so a code-block containing "#default" causes
// an infinite create→revert→create loop between the entity transform and any
// after-the-fact code guard.
// ---------------------------------------------------------------------------

function $isInsideCode(node: LexicalNode): boolean {
  const parent = node.getParent();
  if (parent != null && $isCodeNode(parent)) {
    return true;
  }
  if ($isTextNode(node) && (node.getFormat() & IS_CODE) !== 0) {
    return true;
  }
  return false;
}

function $replaceWithSimpleText(node: TextNode): void {
  const textNode = $createTextNode(node.getTextContent());
  textNode.setFormat(node.getFormat());
  node.replace(textNode);
}

/**
 * Handle the case where the previous sibling is a text/hashtag node.
 * Returns null if the caller should continue, otherwise returns early.
 */
function handlePrevSiblingHashtag(
  prevSibling: TextNode,
  text: string,
  node: TextNode,
  getMode: (node: TextNode) => number,
): "handled" | null {
  const previousText = prevSibling.getTextContent();
  const combinedText = previousText + text;
  const prevMatch = getHashtagMatch(combinedText);

  if ($isHashtagNode(prevSibling)) {
    if (prevMatch === null || getMode(prevSibling) !== 0) {
      $replaceWithSimpleText(prevSibling);
      return "handled";
    }
    const diff = prevMatch.end - previousText.length;
    if (diff > 0) {
      const newTextContent = previousText + text.slice(0, diff);
      prevSibling.select();
      prevSibling.setTextContent(newTextContent);
      if (diff === text.length) {
        node.remove();
      } else {
        node.setTextContent(text.slice(diff));
      }
      return "handled";
    }
  } else if (prevMatch === null || prevMatch.start < previousText.length) {
    return "handled";
  }

  return null;
}

/**
 * When the next text after the current match is empty, check the next sibling
 * to determine if we should stop. Returns true if the caller should return.
 */
function handleEmptyNextText(currentNode: TextNode): boolean {
  const nextSibling = currentNode.getNextSibling();
  if (!$isTextNode(nextSibling)) return false;

  const nextText = currentNode.getTextContent() + nextSibling.getTextContent();
  const nextMatch = getHashtagMatch(nextText);
  if (nextMatch === null) {
    if ($isHashtagNode(nextSibling)) {
      $replaceWithSimpleText(nextSibling);
    } else {
      nextSibling.markDirty();
    }
    return true;
  }
  return nextMatch.start !== 0;
}

function registerHashtag(editor: LexicalEditor) {
  // Mirrors upstream registerLexicalTextEntity — no public API for __mode
  const getMode = (node: TextNode): number =>
    (node.getLatest() as unknown as { __mode: number }).__mode;

  // Forward transform: TextNode → HashtagNode (skips code contexts)
  // eslint-disable-next-line sonarjs/cognitive-complexity -- fork of Lexical's registerLexicalTextEntity; complexity is inherent
  const removeTextTransform = editor.registerNodeTransform(TextNode, (node) => {
    if (!node.isSimpleText() || $isInsideCode(node)) {
      return;
    }

    let prevSibling = node.getPreviousSibling();
    let text = node.getTextContent();
    let currentNode: TextNode | undefined = node;

    if ($isTextNode(prevSibling)) {
      const handled = handlePrevSiblingHashtag(
        prevSibling,
        text,
        node,
        getMode,
      );
      if (handled !== null) return;
    }

    let prevMatchLengthToSkip = 0;

    while (true) {
      const match = getHashtagMatch(text);
      const nextText = match === null ? "" : text.slice(match.end);
      text = nextText;

      if (nextText === "" && handleEmptyNextText(currentNode!)) {
        return;
      }

      if (match === null) {
        return;
      }

      if (
        match.start === 0 &&
        $isTextNode(prevSibling) &&
        prevSibling.isTextEntity()
      ) {
        prevMatchLengthToSkip += match.end;
        continue;
      }

      const splitResult: TextNode[] =
        match.start === 0
          ? currentNode!.splitText(match.end)
          : currentNode!.splitText(
              match.start + prevMatchLengthToSkip,
              match.end + prevMatchLengthToSkip,
            );
      const nodeToReplace = match.start === 0 ? splitResult[0] : splitResult[1];
      currentNode = match.start === 0 ? splitResult[1] : splitResult[2];

      if (nodeToReplace == null) {
        return;
      }

      const replacementNode = $createHashtagNode(
        nodeToReplace.getTextContent(),
      );
      replacementNode.setFormat(nodeToReplace.getFormat());
      nodeToReplace.replace(replacementNode);

      if (currentNode == null) {
        return;
      }
      prevMatchLengthToSkip = 0;
      prevSibling = replacementNode;
    }
  });

  // Reverse transform: HashtagNode → TextNode (when text no longer matches
  // or the node is inside code)
  const removeHashtagTransform = editor.registerNodeTransform(
    HashtagNode,
    (node) => {
      if ($isInsideCode(node)) {
        $replaceWithSimpleText(node);
        return;
      }

      const text = node.getTextContent();
      const match = getHashtagMatch(text);

      if (match === null || match.start !== 0) {
        $replaceWithSimpleText(node);
        return;
      }

      if (text.length > match.end) {
        node.splitText(match.end);
        return;
      }

      const prevSibling = node.getPreviousSibling();
      if ($isTextNode(prevSibling) && prevSibling.isTextEntity()) {
        $replaceWithSimpleText(prevSibling);
        $replaceWithSimpleText(node);
      }

      const nextSibling = node.getNextSibling();
      if ($isTextNode(nextSibling) && nextSibling.isTextEntity()) {
        $replaceWithSimpleText(nextSibling);
        if ($isHashtagNode(node)) {
          $replaceWithSimpleText(node);
        }
      }
    },
  );

  return mergeRegister(removeTextTransform, removeHashtagTransform);
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export const HashtagExtension = defineExtension({
  name: "comet/Hashtag",
  nodes: () => [HashtagNode],
  register: registerHashtag,
});
