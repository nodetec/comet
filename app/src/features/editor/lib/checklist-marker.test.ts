import { describe, expect, it } from "vitest";
import {
  $createListItemNode,
  $createListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import {
  $createRangeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  $setSelection,
  createEditor,
} from "lexical";
import {
  ListAnchorNode,
  $createListAnchorNode,
  $isListAnchorNode,
} from "../nodes/list-anchor-node";
import {
  getChecklistItemsWithSelectedMarkers,
  isEmptyChecklistLeafItem,
  normalizeChecklistItemMarker,
} from "./checklist-marker";
import {
  CHECKLIST_CURSOR_ANCHOR,
  CHECKLIST_PLACEHOLDER,
  $convertChecklistItemToParagraph,
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

  it("keeps list anchors token-mode across writable updates", () => {
    const editor = createTestEditor();
    let mode = "";
    let anchorText = "";

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const item = $createListItemNode(false);
        const anchor = $createListAnchorNode();
        item.append(anchor, $createTextNode("Task"));
        checklist.append(item);
        $getRoot().append(checklist);

        anchor.setAnchorText("\u200B");

        const latestAnchor = item.getFirstChild();
        if (!$isListAnchorNode(latestAnchor) || !$isTextNode(latestAnchor)) {
          throw new Error(
            "expected latest child to be a list anchor text node",
          );
        }

        mode = latestAnchor.getMode();
        anchorText = latestAnchor.getAnchorText();
      },
      { discrete: true },
    );

    expect(mode).toBe("token");
    expect(anchorText).toBe("\u200B");
  });

  it("converts an item to a paragraph when marker and text are deleted together", () => {
    const editor = createTestEditor();
    let topLevelTypes: string[] = [];
    let paragraphIsEmpty = false;

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const item = $createListItemNode(false);
        item.append($createTextNode("Task"));
        checklist.append(item);
        $getRoot().append(checklist);

        normalizeChecklistItemMarker(item);

        const marker = item.getFirstChild();
        const text = item
          .getChildren()
          .find(
            (child) => $isTextNode(child) && child.getTextContent() === "Task",
          );
        if (!$isListAnchorNode(marker) || !$isTextNode(text)) {
          throw new Error("expected normalized checklist marker and text");
        }

        const selection = $createRangeSelection();
        selection.anchor.set(marker.getKey(), 0, "text");
        selection.focus.set(text.getKey(), text.getTextContentSize(), "text");
        $setSelection(selection);

        const affectedItems = getChecklistItemsWithSelectedMarkers(selection);
        selection.removeText();

        for (const affectedItem of affectedItems) {
          if (
            affectedItem.isAttached() &&
            isEmptyChecklistLeafItem(affectedItem)
          ) {
            $convertChecklistItemToParagraph(affectedItem, "start");
          }
        }

        const rootChildren = $getRoot().getChildren();
        topLevelTypes = rootChildren.map((child) => child.getType());
        const onlyChild = rootChildren[0];
        paragraphIsEmpty =
          rootChildren.length === 1 &&
          $isParagraphNode(onlyChild) &&
          onlyChild.getChildrenSize() === 0;
      },
      { discrete: true },
    );

    expect(topLevelTypes).toEqual(["paragraph"]);
    expect(paragraphIsEmpty).toBe(true);
  });
});
