import { describe, expect, it } from "vitest";
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import { $createTextNode, $getRoot, createEditor } from "lexical";

import { ListAnchorNode } from "../nodes/list-anchor-node";
import { normalizeChecklistItemMarker } from "./checklist-marker";
import {
  parseSingleChecklistItemContent,
  replaceEmptyChecklistItemWithChecklistNodes,
} from "./checklist-paste";
import {
  stripChecklistPlaceholders,
  CHECKLIST_PLACEHOLDER,
} from "./todo-shortcut";

function createTestEditor() {
  return createEditor({
    namespace: "checklist-paste-test",
    nodes: [ListNode, ListItemNode, ListAnchorNode],
    onError: (error) => {
      throw error;
    },
  });
}

describe("parseSingleChecklistItemContent", () => {
  it("extracts checklist content from a single checklist line", () => {
    expect(parseSingleChecklistItemContent("- [ ] follow up")).toBe(
      "follow up",
    );
    expect(parseSingleChecklistItemContent("- [x] done")).toBe("done");
    expect(parseSingleChecklistItemContent("* [X] uppercase")).toBe(
      "uppercase",
    );
  });

  it("returns an empty string for a bare checklist marker", () => {
    expect(parseSingleChecklistItemContent("- [ ]")).toBe("");
  });

  it("ignores multi-line or non-checklist markdown", () => {
    expect(parseSingleChecklistItemContent("- [ ] first\n- [ ] second")).toBe(
      null,
    );
    expect(parseSingleChecklistItemContent("plain text")).toBe(null);
    expect(parseSingleChecklistItemContent("## heading")).toBe(null);
  });
});

describe("replaceEmptyChecklistItemWithChecklistNodes", () => {
  it("replaces an empty checklist item with pasted checklist items in place", () => {
    const editor = createTestEditor();
    let checklistTexts: string[] = [];
    let checkedStates: boolean[] = [];

    editor.update(
      () => {
        const checklist = $createListNode("check");
        const firstItem = $createListItemNode(false);
        firstItem.append($createTextNode("before"));
        normalizeChecklistItemMarker(firstItem);

        const emptyItem = $createListItemNode(false);
        emptyItem.append($createTextNode(CHECKLIST_PLACEHOLDER));
        normalizeChecklistItemMarker(emptyItem);

        const trailingItem = $createListItemNode(false);
        trailingItem.append($createTextNode("after"));
        normalizeChecklistItemMarker(trailingItem);

        checklist.append(firstItem, emptyItem, trailingItem);
        $getRoot().append(checklist);

        const importedChecklist = $createListNode("check");
        const pastedOne = $createListItemNode(false);
        pastedOne.append($createTextNode("chrome/firefox nostr signer"));
        const pastedTwo = $createListItemNode(false);
        pastedTwo.append(
          $createTextNode(
            "deploy multiple relays (maybe a neon branch per relay?)",
          ),
        );
        const pastedThree = $createListItemNode(true);
        pastedThree.append($createTextNode("locked notes"));
        importedChecklist.append(pastedOne, pastedTwo, pastedThree);

        const didReplace = replaceEmptyChecklistItemWithChecklistNodes(
          emptyItem,
          [importedChecklist],
        );

        expect(didReplace).toBe(true);

        const topLevelItems = checklist.getChildren().filter($isListItemNode);
        checklistTexts = topLevelItems.map((item) =>
          stripChecklistPlaceholders(item.getTextContent()),
        );
        checkedStates = topLevelItems.map((item) => item.getChecked() ?? false);
      },
      { discrete: true },
    );

    expect(checklistTexts).toEqual([
      "before",
      "chrome/firefox nostr signer",
      "deploy multiple relays (maybe a neon branch per relay?)",
      "locked notes",
      "after",
    ]);
    expect(checkedStates).toEqual([false, false, false, true, false]);
  });
});
