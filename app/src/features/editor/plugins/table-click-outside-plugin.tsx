import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getRoot,
  type LexicalEditor,
  type LexicalNode,
  RootNode,
} from "lexical";
import { $isTableNode } from "@lexical/table";

function $selectAfterTable(tableChild: LexicalNode): void {
  const next = tableChild.getNextSibling();
  if (next) {
    next.selectStart();
  } else {
    const p = $createParagraphNode();
    tableChild.insertAfter(p);
    p.select();
  }
}

function $selectBeforeTable(tableChild: LexicalNode): void {
  const prev = tableChild.getPreviousSibling();
  if (prev) {
    prev.selectEnd();
  } else {
    const p = $createParagraphNode();
    tableChild.insertBefore(p);
    p.select();
  }
}

function $findAndSelectTableSibling(
  editor: LexicalEditor,
  table: HTMLTableElement,
  scrollWrapper: HTMLElement,
  isRight: boolean,
): void {
  const root = $getRoot();
  for (const child of root.getChildren()) {
    if (!$isTableNode(child)) continue;

    const domElement = editor.getElementByKey(child.getKey());
    if (
      domElement === table ||
      domElement?.querySelector("table") === table ||
      domElement === scrollWrapper
    ) {
      if (isRight) {
        $selectAfterTable(child);
      } else {
        $selectBeforeTable(child);
      }
      return;
    }
  }
}

export default function TableClickOutsidePlugin(): null {
  const [editor] = useLexicalComposerContext();

  // Ensure paragraphs exist before/after tables so the cursor
  // always has somewhere to land outside the table.
  useEffect(() => {
    return editor.registerNodeTransform(RootNode, (root) => {
      const firstChild = root.getFirstChild();
      if (firstChild && $isTableNode(firstChild)) {
        firstChild.insertBefore($createParagraphNode());
      }

      const lastChild = root.getLastChild();
      if (lastChild && $isTableNode(lastChild)) {
        lastChild.insertAfter($createParagraphNode());
      }

      // Also ensure paragraphs between adjacent tables
      const children = root.getChildren();
      for (let i = 0; i < children.length - 1; i++) {
        if ($isTableNode(children[i]) && $isTableNode(children[i + 1])) {
          children[i].insertAfter($createParagraphNode());
        }
      }
    });
  }, [editor]);

  // Handle clicks to the left/right of tables
  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      const rootElement = editor.getRootElement();
      if (!rootElement) return;

      const target = event.target as HTMLElement;
      if (target !== rootElement) return;

      const clickX = event.clientX;
      const clickY = event.clientY;

      const tables = rootElement.querySelectorAll("table");

      for (const table of tables) {
        const scrollWrapper = table.parentElement;
        if (!scrollWrapper) continue;

        const wrapperRect = scrollWrapper.getBoundingClientRect();
        const isInVerticalRange =
          clickY >= wrapperRect.top && clickY <= wrapperRect.bottom;
        if (!isInVerticalRange) continue;

        const isClickToRight = clickX > wrapperRect.right;
        const isClickToLeft = clickX < wrapperRect.left;
        if (!isClickToRight && !isClickToLeft) continue;

        event.preventDefault();
        event.stopPropagation();

        editor.update(() => {
          $findAndSelectTableSibling(
            editor,
            table,
            scrollWrapper,
            isClickToRight,
          );
        });

        return;
      }
    };

    return editor.registerRootListener((rootElement, prevRootElement) => {
      prevRootElement?.removeEventListener("mousedown", handleMouseDown, {
        capture: true,
      });
      rootElement?.addEventListener("mousedown", handleMouseDown, {
        capture: true,
      });
    });
  }, [editor]);

  return null;
}
