import type {
  DOMConversionMap,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedTextNode,
} from "lexical";
import { TextNode } from "lexical";

const ZWSP = "\u200B";

export type SerializedListAnchorNode = SerializedTextNode;

export class ListAnchorNode extends TextNode {
  static getType(): string {
    return "list-anchor";
  }

  static clone(node: ListAnchorNode): ListAnchorNode {
    return new ListAnchorNode(node.__key);
  }

  static importJSON(): ListAnchorNode {
    return $createListAnchorNode();
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  constructor(key?: NodeKey) {
    super(ZWSP, key);
  }

  exportJSON(): SerializedListAnchorNode {
    return {
      ...super.exportJSON(),
      type: "list-anchor",
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.classList.add("comet-list-anchor");
    return dom;
  }

  updateDOM(
    prevNode: ListAnchorNode,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (super.updateDOM as any)(prevNode, dom, config);
  }

  getTextContent(): string {
    return "";
  }

  getAnchorText(): string {
    return this.getLatest().__text;
  }

  resetAnchorText(): this {
    const self = this.getWritable();
    self.__text = ZWSP;
    return self;
  }
}

export function $createListAnchorNode(): ListAnchorNode {
  return new ListAnchorNode();
}

export function $isListAnchorNode(
  node: LexicalNode | null | undefined,
): node is ListAnchorNode {
  return node instanceof ListAnchorNode;
}
