import { useCallback, useEffect, useRef } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useLexicalNodeSelection } from "@lexical/react/useLexicalNodeSelection";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { mergeRegister } from "@lexical/utils";
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
} from "lexical";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getSelection,
  $isNodeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_LOW,
  DecoratorNode,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
} from "lexical";

// ---------------------------------------------------------------------------
// React component — modeled exactly on ImageComponent
// ---------------------------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components -- Lexical node + component co-location is standard
function HorizontalRuleComponent({ nodeKey }: { nodeKey: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const [isSelected, setSelected, clearSelection] =
    useLexicalNodeSelection(nodeKey);
  const isEditable = useLexicalEditable();

  const onClick = useCallback(
    (event: MouseEvent) => {
      if (wrapperRef.current?.contains(event.target as Node)) {
        console.log("[HR] Click on HR area → node selection");
        if (event.shiftKey) {
          setSelected(!isSelected);
        } else {
          clearSelection();
          setSelected(true);
        }
        return true;
      }
      return false;
    },
    [isSelected, setSelected, clearSelection],
  );

  const $onDelete = useCallback(
    (event: KeyboardEvent) => {
      if (isSelected && $isNodeSelection($getSelection())) {
        event.preventDefault();
        const node = $getNodeByKey(nodeKey);
        if (node) node.remove();
        return true;
      }
      return false;
    },
    [isSelected, nodeKey],
  );

  const $onEnter = useCallback(
    (event: KeyboardEvent) => {
      const selection = $getSelection();
      if (
        isSelected &&
        $isNodeSelection(selection) &&
        selection.getNodes().length === 1
      ) {
        event.preventDefault();
        const node = $getNodeByKey(nodeKey);
        if (node) {
          const p = $createParagraphNode();
          node.insertAfter(p);
          p.selectEnd();
        }
        clearSelection();
        return true;
      }
      return false;
    },
    [isSelected, nodeKey, clearSelection],
  );

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand<MouseEvent>(
        CLICK_COMMAND,
        onClick,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_DELETE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        $onDelete,
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        $onEnter,
        COMMAND_PRIORITY_CRITICAL,
      ),
    );
  }, [editor, onClick, $onDelete, $onEnter]);

  const isFocused = isSelected && isEditable;

  return (
    <span
      ref={wrapperRef}
      className="inline-flex w-full cursor-text items-center py-3 align-middle"
      style={
        isFocused ? { backgroundColor: "var(--editor-selection)" } : undefined
      }
    >
      <span className="bg-border h-px w-full" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Lexical node
// ---------------------------------------------------------------------------

export class CometHorizontalRuleNode extends DecoratorNode<React.ReactNode> {
  static getType(): string {
    return "horizontalrule";
  }

  static clone(node: CometHorizontalRuleNode): CometHorizontalRuleNode {
    return new CometHorizontalRuleNode(node.__key);
  }

  static importJSON(): CometHorizontalRuleNode {
    return $createCometHorizontalRuleNode();
  }

  static importDOM(): DOMConversionMap | null {
    return {
      hr: () => ({
        conversion: $convertHorizontalRuleElement,
        priority: 0,
      }),
    };
  }

  exportJSON(): SerializedLexicalNode {
    return { type: "horizontalrule", version: 1 };
  }

  exportDOM(): DOMExportOutput {
    return { element: document.createElement("hr") };
  }

  createDOM(config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    const className = config.theme.image;
    if (className) {
      span.className = className;
    }
    return span;
  }

  updateDOM(): boolean {
    return false;
  }

  getTextContent(): string {
    return "\n";
  }

  isInline(): true {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  decorate(): React.ReactNode {
    return <HorizontalRuleComponent nodeKey={this.__key} />;
  }
}

function $convertHorizontalRuleElement(): DOMConversionOutput {
  return { node: $createCometHorizontalRuleNode() };
}

export function $createCometHorizontalRuleNode(): CometHorizontalRuleNode {
  return new CometHorizontalRuleNode();
}

export function $isCometHorizontalRuleNode(
  node: LexicalNode | null | undefined,
): node is CometHorizontalRuleNode {
  return node instanceof CometHorizontalRuleNode;
}
