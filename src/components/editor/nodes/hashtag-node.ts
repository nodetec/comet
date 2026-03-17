import type { EditorConfig, LexicalNode, SerializedTextNode } from "lexical";

import { addClassNamesToElement } from "@lexical/utils";
import { $applyNodeReplacement, TextNode } from "lexical";

export class HashtagNode extends TextNode {
  static getType(): string {
    return "hashtag";
  }

  static clone(node: HashtagNode): HashtagNode {
    return new HashtagNode(node.__text, node.__key);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    addClassNamesToElement(element, config.theme.hashtag);
    return element;
  }

  static importJSON(serializedNode: SerializedTextNode): HashtagNode {
    return $createHashtagNode().updateFromJSON(serializedNode);
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  isTextEntity(): true {
    return true;
  }
}

export function $createHashtagNode(text = ""): HashtagNode {
  return $applyNodeReplacement(new HashtagNode(text));
}

export function $isHashtagNode(
  node: LexicalNode | null | undefined,
): node is HashtagNode {
  return node instanceof HashtagNode;
}
