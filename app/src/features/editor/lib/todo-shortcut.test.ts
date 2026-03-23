import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  createEditor,
} from "lexical";
import { describe, expect, it } from "vitest";

import {
  $convertChecklistParagraphToNestedItem,
  $convertNestedChecklistItemToParagraph,
  $isChecklistPlaceholderText,
  $collapseChecklistPlaceholderSelection,
  $normalizeChecklistPlaceholderTextNode,
  $replaceEmptyParagraphWithChecklist,
} from "./todo-shortcut";

function createTestEditor() {
  return createEditor({
    namespace: "todo-shortcut-test",
    nodes: [ListNode, ListItemNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("todo shortcut", () => {
  it("replaces an empty paragraph before a checklist with a new first checklist item", () => {
    const editor = createTestEditor();
    let rootTypes: string[] = [];
    let checklistTexts: string[] = [];
    let selectionShape: {
      anchorType: string;
      anchorOffset: number;
      focusOffset: number;
    } | null = null;

    editor.update(
      () => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode("Above"));
        const emptyParagraph = $createParagraphNode();
        const checklist = $createListNode("check");
        const existingItem = $createListItemNode(false);
        existingItem.append($createTextNode("asdf"));
        checklist.append(existingItem);
        root.append(paragraph, emptyParagraph, checklist);

        expect($replaceEmptyParagraphWithChecklist(emptyParagraph)).toBe(true);

        rootTypes = root.getChildren().map((child) => child.getType());
        checklistTexts = checklist
          .getChildren()
          .filter($isListItemNode)
          .map((item) => item.getTextContent());

        const selection = $getSelection();
        expect($isRangeSelection(selection)).toBe(true);
        if (!$isRangeSelection(selection)) {
          return;
        }

        selectionShape = {
          anchorType: selection.anchor.type,
          anchorOffset: selection.anchor.offset,
          focusOffset: selection.focus.offset,
        };
      },
      { discrete: true },
    );

    expect(rootTypes).toEqual(["paragraph", "list"]);
    expect(checklistTexts).toEqual(["\u200B", "asdf"]);
    expect(selectionShape).toEqual({
      anchorType: "text",
      anchorOffset: 0,
      focusOffset: 1,
    });
  });

  it("identifies checklist placeholder text nodes", () => {
    const editor = createTestEditor();
    let result = false;

    editor.update(
      () => {
        result = $isChecklistPlaceholderText($createTextNode("\u200B"));
      },
      { discrete: true },
    );

    expect(result).toBe(true);
  });

  it("treats placeholder-only paragraphs as empty for checklist insertion", () => {
    const editor = createTestEditor();
    let rootTypes: string[] = [];
    let checklistTexts: string[] = [];

    editor.update(
      () => {
        const root = $getRoot();
        const emptyParagraph = $createParagraphNode();
        emptyParagraph.append($createTextNode("\u200B"));
        root.append(emptyParagraph);

        expect($replaceEmptyParagraphWithChecklist(emptyParagraph)).toBe(true);

        rootTypes = root.getChildren().map((child) => child.getType());

        const checklist = root.getFirstChild();
        expect($isListNode(checklist)).toBe(true);
        if (!$isListNode(checklist)) {
          return;
        }

        checklistTexts = checklist
          .getChildren()
          .filter($isListItemNode)
          .map((item) => item.getTextContent());
      },
      { discrete: true },
    );

    expect(rootTypes).toEqual(["list"]);
    expect(checklistTexts).toEqual(["\u200B"]);
  });

  it("collapses the placeholder selection to a caret", () => {
    const editor = createTestEditor();
    let selectionShape: {
      anchorOffset: number;
      focusOffset: number;
      isCollapsed: boolean;
    } | null = null;

    editor.update(
      () => {
        const root = $getRoot();
        const emptyParagraph = $createParagraphNode();
        root.append(emptyParagraph);

        expect($replaceEmptyParagraphWithChecklist(emptyParagraph)).toBe(true);
        expect($collapseChecklistPlaceholderSelection()).toBe(true);

        const selection = $getSelection();
        expect($isRangeSelection(selection)).toBe(true);
        if (!$isRangeSelection(selection)) {
          return;
        }

        selectionShape = {
          anchorOffset: selection.anchor.offset,
          focusOffset: selection.focus.offset,
          isCollapsed: selection.isCollapsed(),
        };
      },
      { discrete: true },
    );

    expect(selectionShape).toEqual({
      anchorOffset: 1,
      focusOffset: 1,
      isCollapsed: true,
    });
  });

  it("strips placeholder text once real checklist content is typed", () => {
    const editor = createTestEditor();
    let textContent = "";
    let selectionShape: {
      anchorOffset: number;
      focusOffset: number;
      isCollapsed: boolean;
    } | null = null;

    editor.update(
      () => {
        const root = $getRoot();
        const emptyParagraph = $createParagraphNode();
        root.append(emptyParagraph);

        expect($replaceEmptyParagraphWithChecklist(emptyParagraph)).toBe(true);

        const checklist = root.getFirstChild();
        expect($isListNode(checklist)).toBe(true);
        if (!$isListNode(checklist)) {
          return;
        }

        const listItem = checklist.getFirstChild();
        expect($isListItemNode(listItem)).toBe(true);
        if (!$isListItemNode(listItem)) {
          return;
        }

        const textNode = listItem.getFirstChild();
        expect($isTextNode(textNode)).toBe(true);
        if (!$isTextNode(textNode)) {
          return;
        }

        textNode.setTextContent("\u200Bhello");
        textNode.select(6, 6);
        expect($normalizeChecklistPlaceholderTextNode(textNode)).toBe(true);
        textContent = textNode.getTextContent();

        const selection = $getSelection();
        expect($isRangeSelection(selection)).toBe(true);
        if (!$isRangeSelection(selection)) {
          return;
        }

        selectionShape = {
          anchorOffset: selection.anchor.offset,
          focusOffset: selection.focus.offset,
          isCollapsed: selection.isCollapsed(),
        };
      },
      { discrete: true },
    );

    expect(textContent).toBe("hello");
    expect(selectionShape).toEqual({
      anchorOffset: 5,
      focusOffset: 5,
      isCollapsed: true,
    });
  });

  it("keeps the parent checklist item when converting a nested child to a paragraph", () => {
    const editor = createTestEditor();
    let rootTypes: string[] = [];
    let topLevelItemCount = 0;
    let parentText = "";
    let ownerChildTypes: string[] = [];
    let nestedTexts: string[] = [];

    editor.update(
      () => {
        const root = $getRoot();
        const checklist = $createListNode("check");
        const parent = $createListItemNode(false);
        parent.append($createTextNode("Parent"));

        const nestedList = $createListNode("check");
        const child = $createListItemNode(false);
        child.append($createTextNode("Child"));
        const sibling = $createListItemNode(false);
        sibling.append($createTextNode("Sibling"));
        nestedList.append(child, sibling);

        parent.append(nestedList);
        checklist.append(parent);
        root.append(checklist);

        expect($convertNestedChecklistItemToParagraph(child)).toBe(true);

        rootTypes = root.getChildren().map((node) => node.getType());
        topLevelItemCount = checklist
          .getChildren()
          .filter($isListItemNode).length;
        parentText = parent.getFirstChild()?.getTextContent() ?? "";
        ownerChildTypes = parent.getChildren().map((node) => node.getType());

        const remainingNestedList = parent
          .getChildren()
          .find(
            (node): node is ListNode =>
              $isListNode(node) && node.getListType() === "check",
          );

        nestedTexts = remainingNestedList
          ? remainingNestedList
              .getChildren()
              .filter($isListItemNode)
              .map((item) => item.getTextContent())
          : [];
      },
      { discrete: true },
    );

    expect(rootTypes).toEqual(["list"]);
    expect(topLevelItemCount).toBe(1);
    expect(parentText).toBe("Parent");
    expect(ownerChildTypes).toEqual(["text", "paragraph", "list"]);
    expect(nestedTexts).toEqual(["Sibling"]);
  });

  it("converts a toggled-off nested checklist paragraph back into a nested checklist item", () => {
    const editor = createTestEditor();
    let rootTypes: string[] = [];
    let topLevelTexts: string[] = [];
    let ownerChildTypes: string[] = [];
    let nestedTexts: string[] = [];

    editor.update(
      () => {
        const root = $getRoot();
        const checklist = $createListNode("check");
        const parent = $createListItemNode(false);
        parent.append($createTextNode("Parent"));

        const initialNestedList = $createListNode("check");
        const child = $createListItemNode(false);
        child.append($createTextNode("Child"));
        initialNestedList.append(child);
        parent.append(initialNestedList);

        const sibling = $createListItemNode(false);
        sibling.append($createTextNode("Next"));

        checklist.append(parent, sibling);
        root.append(checklist);

        expect($convertNestedChecklistItemToParagraph(child)).toBe(true);

        const paragraph = parent.getChildren().find($isParagraphNode);

        expect(paragraph).not.toBeNull();
        if (!paragraph) {
          return;
        }

        expect($convertChecklistParagraphToNestedItem(paragraph)).toBe(true);

        rootTypes = root.getChildren().map((node) => node.getType());
        topLevelTexts = checklist
          .getChildren()
          .filter($isListItemNode)
          .map((item) => item.getFirstChild()?.getTextContent() ?? "");
        ownerChildTypes = parent.getChildren().map((node) => node.getType());

        const nestedList = parent
          .getChildren()
          .find(
            (node): node is ListNode =>
              $isListNode(node) && node.getListType() === "check",
          );
        nestedTexts = nestedList
          ? nestedList
              .getChildren()
              .filter($isListItemNode)
              .map((item) => item.getTextContent())
          : [];
      },
      { discrete: true },
    );

    expect(rootTypes).toEqual(["list"]);
    expect(topLevelTexts).toEqual(["Parent", "Next"]);
    expect(ownerChildTypes).toEqual(["text", "list"]);
    expect(nestedTexts).toEqual(["Child"]);
  });
});
