// @vitest-environment jsdom

import { EditorState } from "@codemirror/state";
import {
  markdown as markdownLanguage,
  markdownLanguage as markdownLang,
} from "@codemirror/lang-markdown";
import { describe, expect, it, beforeEach } from "vitest";

import {
  computeRenumberChanges,
  getListItems,
  getListItemAtLine,
  getListItemForLine,
  getListItemAtPosition,
  _invalidateListModelCache,
} from "@/features/editor/extensions/lists/list-model";

function createState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [
      markdownLanguage({
        base: markdownLang,
      }),
    ],
  });
}

beforeEach(() => {
  _invalidateListModelCache();
});

describe("list model", () => {
  it("builds items for a simple flat list", () => {
    const state = createState("- alpha\n- beta\n- gamma");
    const items = getListItems(state);

    expect(items).toHaveLength(3);
    expect(items[0].marker).toBe("-");
    expect(items[0].depth).toBe(0);
    expect(items[0].parentItem).toBeNull();
    expect(items[0].prevSibling).toBeNull();
    expect(items[0].nextSibling).toBe(items[1]);
    expect(items[1].prevSibling).toBe(items[0]);
    expect(items[1].nextSibling).toBe(items[2]);
    expect(items[2].nextSibling).toBeNull();
  });

  it("builds correct marker positions", () => {
    const state = createState("- hello");
    const items = getListItems(state);

    expect(items).toHaveLength(1);
    expect(items[0].markerFrom).toBe(0); // "-" starts at 0
    expect(items[0].markerTo).toBe(2); // "- " ends at 2
    expect(items[0].contentFrom).toBe(2); // content starts at 2
    expect(items[0].lineFrom).toBe(0);
    expect(items[0].lineTo).toBe(7);
  });

  it("detects task items", () => {
    const state = createState("- [ ] unchecked\n- [x] checked\n- plain");
    const items = getListItems(state);

    expect(items).toHaveLength(3);
    expect(items[0].task).not.toBeNull();
    expect(items[0].task?.checked).toBe(false);
    expect(items[0].contentFrom).toBe(6); // after "- [ ] "
    expect(items[1].task?.checked).toBe(true);
    expect(items[2].task).toBeNull();
  });

  it("builds nested list structure", () => {
    const state = createState("- parent\n  - child1\n  - child2");
    const items = getListItems(state);

    expect(items).toHaveLength(3);

    // Parent is depth 0
    expect(items[0].depth).toBe(0);
    expect(items[0].children).toHaveLength(2);
    expect(items[0].parentItem).toBeNull();

    // Children are depth 1
    expect(items[1].depth).toBe(1);
    expect(items[1].parentItem).toBe(items[0]);
    expect(items[1].prevSibling).toBeNull();
    expect(items[1].nextSibling).toBe(items[2]);

    expect(items[2].depth).toBe(1);
    expect(items[2].parentItem).toBe(items[0]);
    expect(items[2].prevSibling).toBe(items[1]);
    expect(items[2].nextSibling).toBeNull();
  });

  it("handles ordered lists", () => {
    const state = createState("1. first\n2. second");
    const items = getListItems(state);

    expect(items).toHaveLength(2);
    expect(items[0].marker).toBe("1.");
    expect(items[1].marker).toBe("2.");
  });

  it("computes continuation prefix", () => {
    const state = createState("- item");
    const items = getListItems(state);

    // Bullet list: 2-space continuation
    expect(items[0].continuationPrefix).toBe("  ");
  });

  it("computes ordered list continuation prefix", () => {
    const state = createState("1. item");
    const items = getListItems(state);

    // Ordered list: 3-space continuation
    expect(items[0].continuationPrefix).toBe("   ");
  });

  it("caches results per state", () => {
    const state = createState("- item");
    const items1 = getListItems(state);
    const items2 = getListItems(state);

    expect(items1).toBe(items2); // same reference
  });

  it("getListItemAtLine finds item by line start", () => {
    const state = createState("- alpha\n- beta");
    const items = getListItems(state);

    expect(getListItemAtLine(state, 0)).toBe(items[0]);
    expect(getListItemAtLine(state, 8)).toBe(items[1]); // "- beta" starts at 8
    expect(getListItemAtLine(state, 5)).toBeNull(); // not a line start
  });

  it("getListItemForLine finds item by any position on the line", () => {
    const state = createState("- alpha\n- beta");

    const item = getListItemForLine(state, 3); // middle of "alpha"
    expect(item).not.toBeNull();
    expect(item?.marker).toBe("-");
    expect(item?.lineFrom).toBe(0);
  });

  it("getListItemAtPosition finds item in marker range", () => {
    const state = createState("- hello");

    expect(getListItemAtPosition(state, 0)).not.toBeNull(); // at "-"
    expect(getListItemAtPosition(state, 1)).not.toBeNull(); // at " "
    expect(getListItemAtPosition(state, 2)).not.toBeNull(); // at contentFrom
    expect(getListItemAtPosition(state, 3)).toBeNull(); // inside content
  });

  it("handles non-list content gracefully", () => {
    const state = createState("just a paragraph\n\nno lists here");
    const items = getListItems(state);
    expect(items).toHaveLength(0);
  });

  it("handles mixed content with lists", () => {
    const state = createState("paragraph\n\n- item\n\nanother paragraph");
    const items = getListItems(state);

    expect(items).toHaveLength(1);
    expect(items[0].marker).toBe("-");
  });

  it("computes indent style string", () => {
    const state = createState("- item");
    const items = getListItems(state);

    expect(items[0].indentStyle).toContain("--cm-md-list-child-indent");
    expect(items[0].indentStyle).toContain("calc(");
  });
});

describe("computeRenumberChanges", () => {
  it("returns null for correctly numbered lists", () => {
    const state = createState("1. first\n2. second\n3. third");
    expect(computeRenumberChanges(state)).toBeNull();
  });

  it("fixes misnumbered items", () => {
    const state = createState("1. first\n1. second\n1. third");
    const changes = computeRenumberChanges(state);
    expect(changes).not.toBeNull();
    expect(changes).toHaveLength(2);
    expect(changes![0].insert).toBe("2.");
    expect(changes![1].insert).toBe("3.");
  });

  it("fixes gaps in numbering", () => {
    const state = createState("1. first\n5. second\n9. third");
    const changes = computeRenumberChanges(state);
    expect(changes).not.toBeNull();
    expect(changes).toHaveLength(2);
    expect(changes![0].insert).toBe("2.");
    expect(changes![1].insert).toBe("3.");
  });

  it("returns null for bullet lists", () => {
    const state = createState("- first\n- second\n- third");
    expect(computeRenumberChanges(state)).toBeNull();
  });

  it("does not renumber bullet items mixed with ordered", () => {
    const state = createState("- bullet\n1. ordered\n2. ordered2");
    const changes = computeRenumberChanges(state);
    expect(changes).toBeNull();
  });
});
