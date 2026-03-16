import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createParagraphNode, $getRoot, RootNode } from "lexical";
import { $isTableNode } from "@lexical/table";

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

        if (clickY >= wrapperRect.top && clickY <= wrapperRect.bottom) {
          const isClickToRight = clickX > wrapperRect.right;
          const isClickToLeft = clickX < wrapperRect.left;

          if (isClickToRight || isClickToLeft) {
            event.preventDefault();
            event.stopPropagation();

            editor.update(() => {
              const root = $getRoot();
              for (const child of root.getChildren()) {
                if (!$isTableNode(child)) continue;

                const domElement = editor.getElementByKey(child.getKey());
                if (
                  domElement === table ||
                  domElement?.querySelector("table") === table ||
                  domElement === scrollWrapper
                ) {
                  if (isClickToRight) {
                    const next = child.getNextSibling();
                    if (next) {
                      next.selectStart();
                    } else {
                      const p = $createParagraphNode();
                      child.insertAfter(p);
                      p.select();
                    }
                  } else {
                    const prev = child.getPreviousSibling();
                    if (prev) {
                      prev.selectEnd();
                    } else {
                      const p = $createParagraphNode();
                      child.insertBefore(p);
                      p.select();
                    }
                  }
                  return;
                }
              }
            });

            return;
          }
        }
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
