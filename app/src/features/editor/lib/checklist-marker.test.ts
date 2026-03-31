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
import {
  CHECKLIST_CURSOR_ANCHOR,
  CHECKLIST_PLACEHOLDER,
} from "./todo-shortcut";

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
    let secondChildText = "";

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const item = $createListItemNode(false);
        item.append($createTextNode("Task"));
        checklist.append(item);
        $getRoot().append(checklist);

        normalizeChecklistItemMarker(item);
        firstChildType = item.getFirstChildOrThrow().getType();
        secondChildText = item.getChildren()[1]?.getTextContent() ?? "";
      },
      { discrete: true },
    );

    expect(firstChildType).toBe("list-anchor");
    expect(secondChildText).toBe(CHECKLIST_CURSOR_ANCHOR);
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

  it("adds a cursor anchor for checklist items with visible content and nested lists", () => {
    const editor = createTestEditor();
    let childSummary: Array<{ type: string; text: string }> = [];

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const parentItem = $createListItemNode(false);
        parentItem.append($createTextNode("Parent"));
        const nestedChecklist = $createListNode("check");
        const nestedItem = $createListItemNode(false);
        nestedItem.append($createTextNode("Child"));
        nestedChecklist.append(nestedItem);
        parentItem.append(nestedChecklist);
        checklist.append(parentItem);
        $getRoot().append(checklist);

        normalizeChecklistItemMarker(parentItem);
        childSummary = parentItem.getChildren().map((child) => ({
          type: child.getType(),
          text: child.getTextContent(),
        }));
      },
      { discrete: true },
    );

    expect(childSummary).toEqual([
      { type: "list-anchor", text: "" },
      { type: "text", text: CHECKLIST_CURSOR_ANCHOR },
      { type: "text", text: "Parent" },
      { type: "list", text: "Child" },
    ]);
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

  it("upgrades legacy zero-width checklist placeholders to the visible placeholder", () => {
    const editor = createTestEditor();
    let placeholderText = "";

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const item = $createListItemNode(false);
        item.append($createTextNode("\u200B"));
        checklist.append(item);
        $getRoot().append(checklist);

        normalizeChecklistItemMarker(item);
        placeholderText =
          item
            .getChildren()
            .find((child) => child.getType() === "text")
            ?.getTextContent() ?? "";
      },
      { discrete: true },
    );

    expect(placeholderText).toBe(CHECKLIST_PLACEHOLDER);
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

  it("is idempotent for already normalized empty checklist items", () => {
    const editor = createTestEditor();
    let firstPassChanged = false;
    let secondPassChanged = true;
    let childTypes: string[] = [];

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const item = $createListItemNode(false);
        checklist.append(item);
        $getRoot().append(checklist);

        firstPassChanged = normalizeChecklistItemMarker(item);
        secondPassChanged = normalizeChecklistItemMarker(item);
        childTypes = item.getChildren().map((child) => child.getType());
      },
      { discrete: true },
    );

    expect(firstPassChanged).toBe(true);
    expect(secondPassChanged).toBe(false);
    expect(childTypes).toEqual(["list-anchor", "text"]);
  });
});
