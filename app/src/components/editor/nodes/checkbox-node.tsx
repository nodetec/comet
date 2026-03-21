import { useCallback, useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $isListItemNode } from "@lexical/list";
import type {
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import {
  $getNodeByKey,
  CLICK_COMMAND,
  COMMAND_PRIORITY_HIGH,
  DecoratorNode,
} from "lexical";

// ---------------------------------------------------------------------------
// Checkmark SVG (same as the old ::before background-image)
// ---------------------------------------------------------------------------

const CHECKMARK_SVG = `url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e")`;

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

function CheckboxComponent({
  nodeKey,
  checked,
}: {
  nodeKey: NodeKey;
  checked: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const isEditable = useLexicalEditable();
  const spanRef = useRef<HTMLSpanElement>(null);

  const onClick = useCallback(
    (event: MouseEvent) => {
      if (!spanRef.current?.contains(event.target as Node)) return false;
      if (!isEditable) return false;

      event.preventDefault();
      event.stopPropagation();

      editor.update(() => {
        const checkboxNode = $getNodeByKey(nodeKey);
        if (!checkboxNode || !$isCheckboxNode(checkboxNode)) return;

        const newChecked = !checkboxNode.__checked;
        checkboxNode.setChecked(newChecked);

        // Sync to parent ListItemNode
        const parent = checkboxNode.getParent();
        if (parent && $isListItemNode(parent)) {
          parent.setChecked(newChecked);
        }
      });

      return true;
    },
    [editor, nodeKey, isEditable],
  );

  useEffect(() => {
    return editor.registerCommand<MouseEvent>(
      CLICK_COMMAND,
      onClick,
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onClick]);

  return (
    <span
      ref={spanRef}
      role="checkbox"
      aria-checked={checked}
      className="mr-2 inline-flex cursor-pointer items-center justify-center align-middle select-none"
      style={{
        width: "1.15em",
        height: "1.15em",
        borderRadius: "0.25em",
        border: checked
          ? "1.5px solid var(--primary)"
          : "1.5px solid var(--muted-foreground)",
        backgroundColor: checked ? "var(--primary)" : "transparent",
        backgroundImage: checked ? CHECKMARK_SVG : "none",
        backgroundSize: "100% 100%",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        flexShrink: 0,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Lexical node
// ---------------------------------------------------------------------------

export type SerializedCheckboxNode = Spread<
  { checked: boolean },
  SerializedLexicalNode
>;

export class CheckboxNode extends DecoratorNode<React.ReactNode> {
  __checked: boolean;

  static getType(): string {
    return "checkbox";
  }

  static clone(node: CheckboxNode): CheckboxNode {
    return new CheckboxNode(node.__checked, node.__key);
  }

  static importJSON(serializedNode: SerializedCheckboxNode): CheckboxNode {
    return new CheckboxNode(serializedNode.checked);
  }

  constructor(checked: boolean = false, key?: NodeKey) {
    super(key);
    this.__checked = checked;
  }

  exportJSON(): SerializedCheckboxNode {
    return {
      type: "checkbox",
      version: 1,
      checked: this.__checked,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.style.display = "inline";
    return span;
  }

  updateDOM(): boolean {
    return false;
  }

  getTextContent(): string {
    return "";
  }

  isInline(): true {
    return true;
  }

  setChecked(checked: boolean): this {
    const self = this.getWritable();
    self.__checked = checked;
    return self;
  }

  getChecked(): boolean {
    return this.__checked;
  }

  decorate(): React.ReactNode {
    return <CheckboxComponent nodeKey={this.__key} checked={this.__checked} />;
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
