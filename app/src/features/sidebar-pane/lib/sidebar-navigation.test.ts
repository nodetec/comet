import { describe, expect, it } from "vitest";

import {
  flattenVisibleSidebarNavigationItems,
  getActiveSidebarNavigationItemId,
  getAdjacentSidebarNavigationItem,
  getSidebarCollapseAction,
  getSidebarExpandAction,
} from "@/features/sidebar-pane/lib/sidebar-navigation";
import { type ContextualTagNode } from "@/shared/api/types";

function createTagNode(
  path: string,
  children: ContextualTagNode[] = [],
): ContextualTagNode {
  const segments = path.split("/");
  return {
    children,
    depth: path.split("/").length,
    directNoteCount: 0,
    hideSubtagNotes: false,
    icon: null,
    inclusiveNoteCount: 0,
    // eslint-disable-next-line unicorn/prefer-at -- app tsconfig target does not include Array.prototype.at()
    label: segments[segments.length - 1] ?? path,
    path,
    pinned: false,
  };
}

describe("flattenVisibleSidebarNavigationItems", () => {
  it("returns visible filters followed by expanded tags in display order", () => {
    const items = flattenVisibleSidebarNavigationItems({
      archivedCount: 1,
      availableTagTree: [
        createTagNode("work", [createTagNode("work/project-a")]),
        createTagNode("personal"),
      ],
      expandedTagPaths: new Set(["work"]),
      noteFilter: "all",
      notesChildrenOpen: true,
      trashedCount: 1,
    });

    expect(items.map((item) => item.id)).toEqual([
      "filter:all",
      "filter:today",
      "filter:todo",
      "filter:pinned",
      "filter:untagged",
      "filter:archive",
      "filter:trash",
      "tag:work",
      "tag:work/project-a",
      "tag:personal",
    ]);
  });

  it("keeps active archive and trash rows visible even when counts are zero", () => {
    expect(
      flattenVisibleSidebarNavigationItems({
        archivedCount: 0,
        availableTagTree: [],
        expandedTagPaths: new Set(),
        noteFilter: "archive",
        notesChildrenOpen: false,
        trashedCount: 0,
      }).map((item) => item.id),
    ).toEqual(["filter:all", "filter:archive"]);

    expect(
      flattenVisibleSidebarNavigationItems({
        archivedCount: 0,
        availableTagTree: [],
        expandedTagPaths: new Set(),
        noteFilter: "trash",
        notesChildrenOpen: false,
        trashedCount: 0,
      }).map((item) => item.id),
    ).toEqual(["filter:all", "filter:trash"]);
  });
});

describe("getActiveSidebarNavigationItemId", () => {
  it("prefers the active tag path over the note filter", () => {
    expect(
      getActiveSidebarNavigationItemId({
        activeTagPath: "work/project-a",
        noteFilter: "all",
      }),
    ).toBe("tag:work/project-a");
  });
});

describe("getAdjacentSidebarNavigationItem", () => {
  const items = flattenVisibleSidebarNavigationItems({
    archivedCount: 0,
    availableTagTree: [createTagNode("work"), createTagNode("personal")],
    expandedTagPaths: new Set(),
    noteFilter: "all",
    notesChildrenOpen: false,
    trashedCount: 0,
  });

  it("returns the next visible item", () => {
    expect(
      getAdjacentSidebarNavigationItem(items, "filter:all", "next"),
    ).toMatchObject({
      id: "tag:work",
    });
  });

  it("returns the previous visible item", () => {
    expect(
      getAdjacentSidebarNavigationItem(items, "tag:personal", "previous"),
    ).toMatchObject({
      id: "tag:work",
    });
  });

  it("falls back to the first item when the current item is missing", () => {
    expect(
      getAdjacentSidebarNavigationItem(items, "tag:missing", "next"),
    ).toMatchObject({
      id: "filter:all",
    });
  });
});

describe("getSidebarExpandAction", () => {
  const tagTree = [createTagNode("work", [createTagNode("work/project-a")])];

  it("opens the notes section from the root notes row", () => {
    expect(
      getSidebarExpandAction({
        activeTagPath: null,
        availableTagTree: tagTree,
        expandedTagPaths: new Set(),
        noteFilter: "all",
        notesChildrenOpen: false,
      }),
    ).toEqual({ kind: "expand-notes" });
  });

  it("opens a collapsed tag that has children", () => {
    expect(
      getSidebarExpandAction({
        activeTagPath: "work",
        availableTagTree: tagTree,
        expandedTagPaths: new Set(),
        noteFilter: "all",
        notesChildrenOpen: true,
      }),
    ).toEqual({ kind: "expand-tag", tagPath: "work" });
  });
});

describe("getSidebarCollapseAction", () => {
  const tagTree = [
    createTagNode("work", [
      createTagNode("work/project-a", [createTagNode("work/project-a/specs")]),
    ]),
  ];

  it("collapses the notes section from an active note filter child", () => {
    expect(
      getSidebarCollapseAction({
        activeTagPath: null,
        availableTagTree: tagTree,
        expandedTagPaths: new Set(["work"]),
        noteFilter: "today",
        notesChildrenOpen: true,
      }),
    ).toEqual({ kind: "collapse-notes" });
  });

  it("collapses an expanded active tag", () => {
    expect(
      getSidebarCollapseAction({
        activeTagPath: "work",
        availableTagTree: tagTree,
        expandedTagPaths: new Set(["work"]),
        noteFilter: "all",
        notesChildrenOpen: true,
      }),
    ).toEqual({ kind: "collapse-tag", tagPath: "work" });
  });

  it("collapses the nearest expanded parent when a leaf tag is active", () => {
    expect(
      getSidebarCollapseAction({
        activeTagPath: "work/project-a/specs",
        availableTagTree: tagTree,
        expandedTagPaths: new Set(["work", "work/project-a"]),
        noteFilter: "all",
        notesChildrenOpen: true,
      }),
    ).toEqual({
      kind: "collapse-tag",
      nextTagPath: "work/project-a",
      tagPath: "work/project-a",
    });
  });
});
