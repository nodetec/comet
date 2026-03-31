import { describe, expect, it } from "vitest";
import {
  $createListItemNode,
  $createListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $setSelection,
  createEditor,
} from "lexical";
import {
  ListAnchorNode,
  $createListAnchorNode,
} from "../nodes/list-anchor-node";
import { shouldCopyChecklistSelectionAsPlainText } from "./checklist-clipboard";

function createTestEditor() {
  return createEditor({
    namespace: "checklist-clipboard-test",
    nodes: [ListNode, ListItemNode, ListAnchorNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("shouldCopyChecklistSelectionAsPlainText", () => {
  it("returns true when only checklist text is selected", () => {
    const editor = createTestEditor();
    let result = false;

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const item = $createListItemNode(false);
        const text = $createTextNode("Task");
        item.append($createListAnchorNode(), text);
        checklist.append(item);
        $getRoot().append(checklist);

        const selection = $createRangeSelection();
        selection.anchor.set(text.getKey(), 0, "text");
        selection.focus.set(text.getKey(), text.getTextContentSize(), "text");
        $setSelection(selection);

        result = shouldCopyChecklistSelectionAsPlainText(selection);
      },
      { discrete: true },
    );

    expect(result).toBe(true);
  });

  it("returns false when the checklist marker is part of the selection", () => {
    const editor = createTestEditor();
    let result = true;

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const item = $createListItemNode(false);
        const marker = $createListAnchorNode();
        const text = $createTextNode("Task");
        item.append(marker, text);
        checklist.append(item);
        $getRoot().append(checklist);

        const selection = $createRangeSelection();
        selection.anchor.set(marker.getKey(), 0, "text");
        selection.focus.set(text.getKey(), text.getTextContentSize(), "text");
        $setSelection(selection);

        result = shouldCopyChecklistSelectionAsPlainText(selection);
      },
      { discrete: true },
    );

    expect(result).toBe(false);
  });
});
