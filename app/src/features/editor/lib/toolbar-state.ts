import { $isCodeNode } from "@lexical/code";
import { $getSelection, $isRangeSelection, $isRootOrShadowRoot } from "lexical";
import { $findMatchingParent } from "@lexical/utils";
import { $isHeadingNode } from "@lexical/rich-text";

export type BlockType = "paragraph" | "h1" | "h2" | "h3" | "code";

export type ToolbarState = {
  blockType: BlockType;
  isBold: boolean;
  isCode: boolean;
  isItalic: boolean;
  isStrikethrough: boolean;
};

export const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  blockType: "paragraph",
  isBold: false,
  isCode: false,
  isItalic: false,
  isStrikethrough: false,
};

export function getToolbarStateFromSelection(): ToolbarState {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) {
    return DEFAULT_TOOLBAR_STATE;
  }

  const anchorNode = selection.anchor.getNode();
  let element =
    anchorNode.getKey() === "root"
      ? anchorNode
      : $findMatchingParent(anchorNode, (e) => {
          const parent = e.getParent();
          return parent !== null && $isRootOrShadowRoot(parent);
        });

  if (element === null) {
    element = anchorNode.getTopLevelElementOrThrow();
  }

  let blockType: BlockType;
  if ($isHeadingNode(element)) {
    blockType = element.getTag() as BlockType;
  } else if ($isCodeNode(element)) {
    blockType = "code";
  } else {
    blockType = "paragraph";
  }

  return {
    blockType,
    isBold: selection.hasFormat("bold"),
    isCode: selection.hasFormat("code"),
    isItalic: selection.hasFormat("italic"),
    isStrikethrough: selection.hasFormat("strikethrough"),
  };
}
