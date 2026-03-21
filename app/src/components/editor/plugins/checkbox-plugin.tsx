import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isListItemNode, $isListNode, ListItemNode } from "@lexical/list";
import {
  $getSelection,
  $getNearestNodeFromDOMNode,
  $isRangeSelection,
  CLICK_COMMAND,
  COMMAND_PRIORITY_HIGH,
  SELECTION_CHANGE_COMMAND,
} from "lexical";

import {
  $createCheckboxNode,
  $isCheckboxNode,
  CheckboxNode,
} from "../nodes/checkbox-node";

/**
 * Syncs CheckboxNode ↔ ListItemNode.__checked and handles clicks.
 *
 * - ListItemNode transform: ensures every checklist item has a CheckboxNode
 *   as its first child, with the correct checked state.
 * - CheckboxNode transform: syncs checked state back to the parent ListItemNode.
 * - Click handler: toggles checked state when clicking the checkbox.
 */
export default function CheckboxPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Ensure every checklist ListItemNode starts with a CheckboxNode.
    const removeListItemTransform = editor.registerNodeTransform(
      ListItemNode,
      (node) => {
        const parent = node.getParent();
        if (!parent || !$isListNode(parent)) return;

        const isChecklist = parent.getListType() === "check";
        const firstChild = node.getFirstChild();
        const hasCheckbox = firstChild && $isCheckboxNode(firstChild);

        if (isChecklist) {
          const checked = node.getChecked() ?? false;

          if (!hasCheckbox) {
            const checkbox = $createCheckboxNode(checked);
            if (firstChild) {
              firstChild.insertBefore(checkbox);
            } else {
              node.append(checkbox);
            }
          } else if (firstChild && $isCheckboxNode(firstChild)) {
            if (firstChild.getChecked() !== checked) {
              firstChild.setChecked(checked);
            }
          }
        } else if (hasCheckbox) {
          firstChild.remove();
        }
      },
    );

    // Sync checked state from CheckboxNode → ListItemNode.
    const removeCheckboxTransform = editor.registerNodeTransform(
      CheckboxNode,
      (node) => {
        const parent = node.getParent();
        if (!parent || !$isListItemNode(parent)) return;

        const checkboxChecked = node.getChecked();
        const listItemChecked = parent.getChecked() ?? false;

        if (checkboxChecked !== listItemChecked) {
          parent.setChecked(checkboxChecked);
        }
      },
    );

    // Click on a checkbox → toggle checked state.
    const removeClick = editor.registerCommand(
      CLICK_COMMAND,
      (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return false;

        // Check if the clicked element is a checkbox span
        if (!target.classList.contains("comet-checkbox")) return false;

        const node = $getNearestNodeFromDOMNode(target);
        if (!node || !$isCheckboxNode(node)) return false;

        event.preventDefault();

        const newChecked = !node.getChecked();
        node.setChecked(newChecked);

        const parent = node.getParent();
        if (parent && $isListItemNode(parent)) {
          parent.setChecked(newChecked);
        }

        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );

    // If the caret lands inside a CheckboxNode (e.g. gutter click),
    // snap it to the start of the text after the checkbox.
    const removeSelectionNorm = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }

        const node = selection.anchor.getNode();
        if (!$isCheckboxNode(node)) return false;

        const next = node.getNextSibling();
        if (next) {
          selection.anchor.set(next.getKey(), 0, "text");
          selection.focus.set(next.getKey(), 0, "text");
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );

    return () => {
      removeListItemTransform();
      removeCheckboxTransform();
      removeClick();
      removeSelectionNorm();
    };
  }, [editor]);

  return null;
}
