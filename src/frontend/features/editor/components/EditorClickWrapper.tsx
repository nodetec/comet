import React, { useEffect, useRef, type ReactNode } from "react";

import { ScrollArea } from "~/components/ui/scroll-area-old";

interface EditorClickWrapperProps {
  children: ReactNode;
}

export const useEditorClick = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;

    const handleClick = (e: MouseEvent) => {
      // Find the editor content element - update selector as needed
      const editorContent = container.querySelector("#editor-content-editable");
      if (!editorContent) {
        return;
      }

      // If clicked directly on the editor or its children, let default behavior happen
      if (editorContent.contains(e.target as Node)) return;

      // Get positions for calculations
      const editorRect = editorContent.getBoundingClientRect();
      const clickX = e.clientX;
      const clickY = e.clientY;

      // Only process clicks within the vertical bounds of the editor
      // and to the left or right of the content area
      if (clickY < editorRect.top || clickY > editorRect.bottom) return;
      if (clickX >= editorRect.left && clickX <= editorRect.right) return;

      // Determine if click was to the left or right
      const isLeftSide = clickX < editorRect.left;

      // Focus the editor first
      (editorContent as HTMLElement).focus();

      // Use the browser's native selection API
      const selection = window.getSelection();
      if (!selection) return;

      const range = document.createRange();

      // Get all top-level paragraph/block elements in the editor
      // Include code tags and pre tags for code blocks
      const paragraphs = Array.from(
        editorContent.querySelectorAll(
          "p, h1, h2, h3, h4, h5, h6, div, li, pre, code",
        ),
      );

      // If no paragraphs, we can't set a position
      if (paragraphs.length === 0) return;

      // Find the closest paragraph to click position
      let closestParagraph = paragraphs[0];
      let minDistance = Infinity;

      for (const paragraph of paragraphs) {
        const rect = paragraph.getBoundingClientRect();
        const midY = (rect.top + rect.bottom) / 2;
        const distance = Math.abs(clickY - midY);

        if (distance < minDistance) {
          minDistance = distance;
          closestParagraph = paragraph;
        }
      }

      // Check if the closest paragraph is a code or pre element
      const isCodeElement =
        closestParagraph.tagName.toLowerCase() === "code" ||
        closestParagraph.tagName.toLowerCase() === "pre" ||
        closestParagraph.querySelector("code") !== null;

      // Special handling for code blocks
      if (isCodeElement) {
        // For code blocks, we want to position at beginning or end but preserve formatting
        if (isLeftSide) {
          // Find the first text node within the code block
          const findFirstTextNode = (node: Node): Node | null => {
            // If it's a text node, return it
            if (node.nodeType === Node.TEXT_NODE) return node;

            // If it has children, recursively search them
            if (node.hasChildNodes()) {
              for (const childNode of node.childNodes) {
                const result = findFirstTextNode(childNode);
                if (result) return result;
              }
            }

            return null;
          };

          const textNode = findFirstTextNode(closestParagraph);
          if (textNode) {
            range.setStart(textNode, 0);
          } else {
            // Fallback to the element itself
            range.setStart(closestParagraph, 0);
          }
        } else {
          // Find the last text node within the code block
          const findLastTextNode = (node: Node): Node | null => {
            // If it has children, recursively search them in reverse order
            if (node.hasChildNodes()) {
              for (let i = node.childNodes.length - 1; i >= 0; i--) {
                const result = findLastTextNode(node.childNodes[i]);
                if (result) return result;
              }
            }

            // If it's a text node, return it
            if (node.nodeType === Node.TEXT_NODE) return node;

            return null;
          };

          const textNode = findLastTextNode(closestParagraph);
          if (textNode) {
            range.setStart(textNode, textNode.textContent?.length ?? 0);
          } else {
            // Fallback to the element itself
            range.setStart(
              closestParagraph,
              closestParagraph.childNodes.length,
            );
          }
        }
      } else {
        // Standard handling for non-code elements
        if (isLeftSide) {
          // Set cursor to beginning of paragraph
          // Handle special cases for nested elements
          let targetNode = closestParagraph;
          while (
            targetNode.firstChild &&
            targetNode.firstChild.nodeType === Node.ELEMENT_NODE
          ) {
            targetNode = targetNode.firstChild as Element;
          }

          // Target first text node if it exists
          if (
            targetNode.firstChild &&
            targetNode.firstChild.nodeType === Node.TEXT_NODE
          ) {
            range.setStart(targetNode.firstChild, 0);
          } else {
            range.setStart(targetNode, 0);
          }
        } else {
          // Set cursor to end of paragraph
          // Handle special cases for nested elements
          let targetNode = closestParagraph;
          while (
            targetNode.lastChild &&
            targetNode.lastChild.nodeType === Node.ELEMENT_NODE
          ) {
            targetNode = targetNode.lastChild as Element;
          }

          // Target last text node if it exists
          if (
            targetNode.lastChild &&
            targetNode.lastChild.nodeType === Node.TEXT_NODE
          ) {
            const textNode = targetNode.lastChild;
            range.setStart(textNode, textNode.textContent?.length ?? 0);
          } else {
            range.setStart(targetNode, targetNode.childNodes.length);
          }
        }
      }

      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);

      // Prevent any default behavior
      e.preventDefault();
    };

    container.addEventListener("mousedown", handleClick);

    return () => {
      container.removeEventListener("mousedown", handleClick);
    };
  }, []);

  return containerRef;
};

/**
 * Component wrapper that adds medium style clicking to any element
 */
export const EditorClickWrapper: React.FC<EditorClickWrapperProps> = ({
  children,
}) => {
  const containerRef = useEditorClick();

  return (
    <ScrollArea
      className="flex w-full flex-1 cursor-text flex-col"
      type="scroll"
      ref={containerRef}
    >
      {children}
    </ScrollArea>
  );
};
