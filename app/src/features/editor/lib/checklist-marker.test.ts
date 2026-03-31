import { describe, expect, it } from "vitest";
import {
  $createListItemNode,
  $createListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
} from "lexical";
import { ListAnchorNode, $isListAnchorNode } from "../nodes/list-anchor-node";
import { normalizeChecklistItemMarker } from "./checklist-marker";
import { CHECKLIST_PLACEHOLDER } from "./todo-shortcut";

function createTestEditor() {
  return createEditor({
    namespace: "checklist-marker-test",
    nodes: [ListNode, ListItemNode, ListAnchorNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("normalizeChecklistItemMarker", () => {
  it("prepends a marker to checklist items with visible content", () => {
    const editor = createTestEditor();
    let firstChildType = "";

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const item = $createListItemNode(false);
        item.append($createTextNode("Task"));
        checklist.append(item);
        $getRoot().append(checklist);

        normalizeChecklistItemMarker(item);
        firstChildType = item.getFirstChildOrThrow().getType();
      },
      { discrete: true },
    );

    expect(firstChildType).toBe("list-anchor");
  });

  it("keeps markers off wrapper-only checklist items", () => {
    const editor = createTestEditor();
    let anchorCount = 0;

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const wrapper = $createListItemNode(false);
        const nestedList = $createListNode("bullet");
        const nestedItem = $createListItemNode();
        nestedItem.append($createTextNode("Child"));
        nestedList.append(nestedItem);
        wrapper.append($createParagraphNode(), nestedList);
        checklist.append(wrapper);
        $getRoot().append(checklist);

        normalizeChecklistItemMarker(wrapper);
        anchorCount = wrapper.getChildren().filter($isListAnchorNode).length;
      },
      { discrete: true },
    );

    expect(anchorCount).toBe(0);
  });

  it("preserves markers for empty checklist items with a placeholder", () => {
    const editor = createTestEditor();
    let anchorCount = 0;
    let placeholderCount = 0;

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const item = $createListItemNode(false);
        item.append($createTextNode(CHECKLIST_PLACEHOLDER));
        checklist.append(item);
        $getRoot().append(checklist);

        normalizeChecklistItemMarker(item);
        anchorCount = item.getChildren().filter($isListAnchorNode).length;
        placeholderCount = item
          .getChildren()
          .filter(
            (child) =>
              child.getType() === "text" &&
              child.getTextContent() === CHECKLIST_PLACEHOLDER,
          ).length;
      },
      { discrete: true },
    );

    expect(anchorCount).toBe(1);
    expect(placeholderCount).toBe(1);
  });

  it("adds a placeholder to empty checklist items that only have a marker", () => {
    const editor = createTestEditor();
    let childTypes: string[] = [];

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const item = $createListItemNode(false);
        checklist.append(item);
        $getRoot().append(checklist);

        normalizeChecklistItemMarker(item);
        childTypes = item.getChildren().map((child) => child.getType());
      },
      { discrete: true },
    );

    expect(childTypes).toEqual(["list-anchor", "text"]);
  });
});
