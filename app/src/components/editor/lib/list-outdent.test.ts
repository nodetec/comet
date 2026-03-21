import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import { $createTextNode, $getRoot, createEditor } from "lexical";
import { describe, expect, it } from "vitest";

import {
  $outdentListItemPreservingOrder,
  $shouldOutdentListItemPreservingOrder,
} from "./list-outdent";

function createTestEditor() {
  return createEditor({
    namespace: "list-outdent-test",
    nodes: [ListNode, ListItemNode],
    onError: (error) => {
      throw error;
    },
  });
}

function getDirectItemText(item: ListItemNode): string {
  const directContent = item
    .getChildren()
    .find(
      (child) =>
        !$isListNode(child) && child.getTextContent().trim().length > 0,
    );

  return directContent?.getTextContent() ?? "";
}

function getNestedItemTexts(item: ListItemNode): string[] {
  const nestedList = item.getChildren().find($isListNode);
  return nestedList
    ? nestedList.getChildren().filter($isListItemNode).map(getDirectItemText)
    : [];
}

describe("list outdent", () => {
  it("keeps a checklist parent with text before the outdented first child", () => {
    const editor = createTestEditor();
    let topLevelTexts: string[] = [];
    let movedNestedTexts: string[] = [];

    editor.update(
      () => {
        const root = $getRoot();
        const checklist = $createListNode("check");
        const parent = $createListItemNode(false);
        parent.append($createTextNode("Parent"));

        const nestedList = $createListNode("check");
        const childA = $createListItemNode(false);
        childA.append($createTextNode("Child A"));
        const childB = $createListItemNode(false);
        childB.append($createTextNode("Child B"));
        nestedList.append(childA, childB);

        parent.append(nestedList);
        checklist.append(parent);
        root.append(checklist);

        expect($shouldOutdentListItemPreservingOrder(childA)).toBe(true);
        expect($outdentListItemPreservingOrder(childA)).toBe(true);

        const topLevelItems = checklist.getChildren().filter($isListItemNode);
        topLevelTexts = topLevelItems.map(getDirectItemText);
        movedNestedTexts = getNestedItemTexts(topLevelItems[1] as ListItemNode);
      },
      { discrete: true },
    );

    expect(topLevelTexts).toEqual(["Parent", "Child A"]);
    expect(movedNestedTexts).toEqual(["Child B"]);
  });

  it("splits checklist siblings around the outdented middle child without dropping the parent text", () => {
    const editor = createTestEditor();
    let topLevelTexts: string[] = [];
    let parentNestedTexts: string[] = [];
    let movedNestedTexts: string[] = [];

    editor.update(
      () => {
        const root = $getRoot();
        const checklist = $createListNode("check");
        const parent = $createListItemNode(false);
        parent.append($createTextNode("Parent"));

        const nestedList = $createListNode("check");
        const childA = $createListItemNode(false);
        childA.append($createTextNode("Child A"));
        const childB = $createListItemNode(false);
        childB.append($createTextNode("Child B"));
        const childC = $createListItemNode(false);
        childC.append($createTextNode("Child C"));
        nestedList.append(childA, childB, childC);

        parent.append(nestedList);
        checklist.append(parent);
        root.append(checklist);

        expect($shouldOutdentListItemPreservingOrder(childB)).toBe(true);
        expect($outdentListItemPreservingOrder(childB)).toBe(true);

        const topLevelItems = checklist.getChildren().filter($isListItemNode);
        topLevelTexts = topLevelItems.map(getDirectItemText);
        parentNestedTexts = getNestedItemTexts(
          topLevelItems[0] as ListItemNode,
        );
        movedNestedTexts = getNestedItemTexts(topLevelItems[1] as ListItemNode);
      },
      { discrete: true },
    );

    expect(topLevelTexts).toEqual(["Parent", "Child B"]);
    expect(parentNestedTexts).toEqual(["Child A"]);
    expect(movedNestedTexts).toEqual(["Child C"]);
  });

  it("falls through for wrapper-only nested list items", () => {
    const editor = createTestEditor();
    let shouldPreserve = true;

    editor.update(
      () => {
        const root = $getRoot();
        const checklist = $createListNode("check");
        const wrapper = $createListItemNode(false);

        const nestedList = $createListNode("check");
        const child = $createListItemNode(false);
        child.append($createTextNode("Child"));
        nestedList.append(child);

        wrapper.append(nestedList);
        checklist.append(wrapper);
        root.append(checklist);

        shouldPreserve = $shouldOutdentListItemPreservingOrder(child);
      },
      { discrete: true },
    );

    expect(shouldPreserve).toBe(false);
  });
});
