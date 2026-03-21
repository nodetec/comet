import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $isListItemNode, $isListNode, ListItemNode } from "@lexical/list";
import {
  $createCheckboxNode,
  $isCheckboxNode,
  CheckboxNode,
} from "../nodes/checkbox-node";

/**
 * Syncs CheckboxNode ↔ ListItemNode.__checked.
 *
 * - ListItemNode transform: ensures every checklist item has a CheckboxNode
 *   as its first child, with the correct checked state.
 * - CheckboxNode transform: syncs checked state back to the parent ListItemNode
 *   when the checkbox is clicked.
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
            // Insert a CheckboxNode at the start.
            const checkbox = $createCheckboxNode(checked);
            if (firstChild) {
              firstChild.insertBefore(checkbox);
            } else {
              node.append(checkbox);
            }
          } else if (firstChild && $isCheckboxNode(firstChild)) {
            // Sync checked state from ListItemNode → CheckboxNode.
            if (firstChild.getChecked() !== checked) {
              firstChild.setChecked(checked);
            }
          }
        } else if (hasCheckbox) {
          // Not a checklist anymore — remove the CheckboxNode.
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

    return () => {
      removeListItemTransform();
      removeCheckboxTransform();
    };
  }, [editor]);

  return null;
}
