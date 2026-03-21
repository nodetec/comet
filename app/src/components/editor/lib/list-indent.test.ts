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

import { $indentChecklistItemPreservingStructure } from "./list-indent";

function createTestEditor() {
  return createEditor({
    namespace: "list-indent-test",
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

describe("list indent", () => {
  it("indents a checklist item under the previous sibling without creating a wrapper item", () => {
    const editor = createTestEditor();
    let topLevelTexts: string[] = [];
    let nestedTexts: string[] = [];

    editor.update(
      () => {
        const root = $getRoot();
        const checklist = $createListNode("check");
        const completed = $createListItemNode(true);
        completed.append($createTextNode("Completed task"));
        const testItem = $createListItemNode(false);
        testItem.append($createTextNode("test"));
        const incomplete = $createListItemNode(false);
        incomplete.append($createTextNode("Incomplete task"));

        checklist.append(completed, testItem, incomplete);
        root.append(checklist);

        expect($indentChecklistItemPreservingStructure(testItem)).toBe(true);

        const topLevelItems = checklist.getChildren().filter($isListItemNode);
        topLevelTexts = topLevelItems.map(getDirectItemText);
        nestedTexts = getNestedItemTexts(topLevelItems[0] as ListItemNode);
      },
      { discrete: true },
    );

    expect(topLevelTexts).toEqual(["Completed task", "Incomplete task"]);
    expect(nestedTexts).toEqual(["test"]);
  });

  it("reuses the previous checklist owner's nested list instead of stacking wrapper items", () => {
    const editor = createTestEditor();
    let topLevelTexts: string[] = [];
    let nestedTexts: string[] = [];

    editor.update(
      () => {
        const root = $getRoot();
        const checklist = $createListNode("check");
        const parent = $createListItemNode(false);
        parent.append($createTextNode("Parent"));

        const wrapper = $createListItemNode(false);
        const nestedList = $createListNode("check");
        const childA = $createListItemNode(false);
        childA.append($createTextNode("Child A"));
        nestedList.append(childA);
        wrapper.append(nestedList);

        const childB = $createListItemNode(false);
        childB.append($createTextNode("Child B"));

        checklist.append(parent, wrapper, childB);
        root.append(checklist);

        expect($indentChecklistItemPreservingStructure(childB)).toBe(true);

        const topLevelItems = checklist.getChildren().filter($isListItemNode);
        topLevelTexts = topLevelItems.map(getDirectItemText);
        nestedTexts = getNestedItemTexts(topLevelItems[0] as ListItemNode);
      },
      { discrete: true },
    );

    expect(topLevelTexts).toEqual(["Parent"]);
    expect(nestedTexts).toEqual(["Child A", "Child B"]);
  });

  it("falls through when there is no previous checklist item to indent under", () => {
    const editor = createTestEditor();
    let didIndent = true;

    editor.update(
      () => {
        const root = $getRoot();
        const checklist = $createListNode("check");
        const firstItem = $createListItemNode(false);
        firstItem.append($createTextNode("First"));
        checklist.append(firstItem);
        root.append(checklist);

        didIndent = $indentChecklistItemPreservingStructure(firstItem);
      },
      { discrete: true },
    );

    expect(didIndent).toBe(false);
  });
});
