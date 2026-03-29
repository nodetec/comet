import type { EditorConfig, LexicalNode, SerializedTextNode } from "lexical";

import { addClassNamesToElement } from "@lexical/utils";
import { $applyNodeReplacement, TextNode } from "lexical";
import { canonicalizeAuthoredTagToken } from "../lib/tags";

function syncHashtagDomMetadata(element: HTMLElement, text: string) {
  const canonical = canonicalizeAuthoredTagToken(text);
  if (canonical) {
    element.dataset.cometTagPath = canonical;
    element.setAttribute("role", "button");
  } else {
    delete element.dataset.cometTagPath;
    element.removeAttribute("role");
  }
}

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
    syncHashtagDomMetadata(element, this.__text);
    return element;
  }

  updateDOM(
    prevNode: HashtagNode,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shouldUpdate = (super.updateDOM as any)(prevNode, dom, config);
    syncHashtagDomMetadata(dom, this.__text);
    return shouldUpdate;
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
