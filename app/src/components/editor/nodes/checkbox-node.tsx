import type {
  DOMConversionMap,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedTextNode,
} from "lexical";
import { TextNode } from "lexical";

/** Unchecked checkbox character */
const UNCHECKED = "\u2610"; // ☐
/** Checked checkbox character */
const CHECKED = "\u2611"; // ☑

export type SerializedCheckboxNode = SerializedTextNode;

export class CheckboxNode extends TextNode {
  __checked: boolean;

  static getType(): string {
    return "checkbox";
  }

  static clone(node: CheckboxNode): CheckboxNode {
    return new CheckboxNode(node.__checked, node.__key);
  }

  static importJSON(serializedNode: SerializedCheckboxNode): CheckboxNode {
    const checked = serializedNode.text === CHECKED;
    return $createCheckboxNode(checked);
  }

  static importDOM(): DOMConversionMap | null {
    return null;
  }

  constructor(checked: boolean = false, key?: NodeKey) {
    super(checked ? CHECKED : UNCHECKED, key);
    this.__checked = checked;
    // Token mode: atomic unit, can't be partially selected or edited
    this.__mode = 1; // 1 = token mode in Lexical
  }

  exportJSON(): SerializedCheckboxNode {
    return {
      ...super.exportJSON(),
      type: "checkbox",
    };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.contentEditable = "false";
    dom.classList.add("comet-checkbox");
    if (this.__checked) {
      dom.classList.add("comet-checkbox--checked");
    }
    return dom;
  }

  updateDOM(
    prevNode: CheckboxNode,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updated = (super.updateDOM as any)(prevNode, dom, config);
    if (prevNode.__checked !== this.__checked) {
      dom.classList.toggle("comet-checkbox--checked", this.__checked);
    }
    return updated;
  }

  setChecked(checked: boolean): this {
    const self = this.getWritable();
    self.__checked = checked;
    self.__text = checked ? CHECKED : UNCHECKED;
    return self;
  }

  getChecked(): boolean {
    return this.__checked;
  }

  // Don't contribute to markdown export — the ListItemNode.__checked
  // property is the source of truth for "- [ ]" / "- [x]".
  getTextContent(): string {
    return "";
  }

  isToken(): boolean {
    return true;
  }

  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }
}

export function $createCheckboxNode(checked: boolean = false): CheckboxNode {
  return new CheckboxNode(checked);
}

export function $isCheckboxNode(
  node: LexicalNode | null | undefined,
): node is CheckboxNode {
  return node instanceof CheckboxNode;
}
