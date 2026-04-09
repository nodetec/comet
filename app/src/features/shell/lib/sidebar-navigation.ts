import { type NoteListNavigationDirection } from "@/features/notes/lib/note-list-navigation";
import { type ContextualTagNode, type NoteFilter } from "@/shared/api/types";

export type SidebarNavigationItem =
  | {
      filter: NoteFilter;
      id: string;
      kind: "filter";
    }
  | {
      id: string;
      kind: "tag";
      tagPath: string;
    };

export type SidebarCollapseAction =
  | {
      kind: "collapse-notes";
    }
  | {
      kind: "collapse-tag";
      nextTagPath?: string;
      tagPath: string;
    };

export type SidebarExpandAction =
  | {
      kind: "expand-notes";
    }
  | {
      kind: "expand-tag";
      tagPath: string;
    };

function flattenVisibleSidebarTagNavigationItems(
  nodes: ContextualTagNode[],
  expandedTagPaths: Set<string>,
): SidebarNavigationItem[] {
  return nodes.flatMap((node) => [
    getSidebarTagNavigationItem(node.path),
    ...(expandedTagPaths.has(node.path)
      ? flattenVisibleSidebarTagNavigationItems(node.children, expandedTagPaths)
      : []),
  ]);
}

function findSidebarTagNode(
  nodes: ContextualTagNode[],
  tagPath: string,
): ContextualTagNode | null {
  for (const node of nodes) {
    if (node.path === tagPath) {
      return node;
    }

    const childMatch = findSidebarTagNode(node.children, tagPath);
    if (childMatch) {
      return childMatch;
    }
  }

  return null;
}

function getParentSidebarTagPath(tagPath: string) {
  const segments = tagPath.split("/");
  if (segments.length <= 1) {
    return null;
  }

  return segments.slice(0, -1).join("/");
}

export function getSidebarFilterNavigationItem(
  filter: NoteFilter,
): SidebarNavigationItem {
  return {
    filter,
    id: `filter:${filter}`,
    kind: "filter",
  };
}

export function getSidebarTagNavigationItem(
  tagPath: string,
): SidebarNavigationItem {
  return {
    id: `tag:${tagPath}`,
    kind: "tag",
    tagPath,
  };
}

export function flattenVisibleSidebarNavigationItems(params: {
  archivedCount: number;
  availableTagTree: ContextualTagNode[];
  expandedTagPaths: Set<string>;
  noteFilter: NoteFilter;
  notesChildrenOpen: boolean;
  trashedCount: number;
}) {
  const {
    archivedCount,
    availableTagTree,
    expandedTagPaths,
    noteFilter,
    notesChildrenOpen,
    trashedCount,
  } = params;
  const items: SidebarNavigationItem[] = [
    getSidebarFilterNavigationItem("all"),
  ];

  if (notesChildrenOpen) {
    items.push(
      getSidebarFilterNavigationItem("today"),
      getSidebarFilterNavigationItem("todo"),
      getSidebarFilterNavigationItem("pinned"),
      getSidebarFilterNavigationItem("untagged"),
    );
  }

  if (archivedCount > 0 || noteFilter === "archive") {
    items.push(getSidebarFilterNavigationItem("archive"));
  }

  if (trashedCount > 0 || noteFilter === "trash") {
    items.push(getSidebarFilterNavigationItem("trash"));
  }

  items.push(
    ...flattenVisibleSidebarTagNavigationItems(
      availableTagTree,
      expandedTagPaths,
    ),
  );

  return items;
}

export function getActiveSidebarNavigationItemId(params: {
  activeTagPath: string | null;
  noteFilter: NoteFilter;
}) {
  return params.activeTagPath
    ? getSidebarTagNavigationItem(params.activeTagPath).id
    : getSidebarFilterNavigationItem(params.noteFilter).id;
}

export function getAdjacentSidebarNavigationItem(
  items: SidebarNavigationItem[],
  currentItemId: string,
  direction: NoteListNavigationDirection,
) {
  if (items.length === 0) {
    return null;
  }

  const currentIndex = items.findIndex((item) => item.id === currentItemId);
  if (currentIndex === -1) {
    // eslint-disable-next-line unicorn/prefer-at -- app tsconfig target does not include Array.prototype.at()
    return direction === "next" ? items[0] : (items[items.length - 1] ?? null);
  }

  const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
  return items[nextIndex] ?? null;
}

export function getSidebarCollapseAction(params: {
  activeTagPath: string | null;
  availableTagTree: ContextualTagNode[];
  expandedTagPaths: Set<string>;
  noteFilter: NoteFilter;
  notesChildrenOpen: boolean;
}) {
  const {
    activeTagPath,
    availableTagTree,
    expandedTagPaths,
    noteFilter,
    notesChildrenOpen,
  } = params;

  if (activeTagPath) {
    const activeTagNode = findSidebarTagNode(availableTagTree, activeTagPath);
    if (
      activeTagNode &&
      activeTagNode.children.length > 0 &&
      expandedTagPaths.has(activeTagPath)
    ) {
      return {
        kind: "collapse-tag",
        tagPath: activeTagPath,
      } satisfies SidebarCollapseAction;
    }

    const parentTagPath = getParentSidebarTagPath(activeTagPath);
    if (parentTagPath && expandedTagPaths.has(parentTagPath)) {
      return {
        kind: "collapse-tag",
        nextTagPath: parentTagPath,
        tagPath: parentTagPath,
      } satisfies SidebarCollapseAction;
    }

    return null;
  }

  if (
    notesChildrenOpen &&
    (noteFilter === "all" ||
      noteFilter === "today" ||
      noteFilter === "todo" ||
      noteFilter === "pinned" ||
      noteFilter === "untagged")
  ) {
    return {
      kind: "collapse-notes",
    } satisfies SidebarCollapseAction;
  }

  return null;
}

export function getSidebarExpandAction(params: {
  activeTagPath: string | null;
  availableTagTree: ContextualTagNode[];
  expandedTagPaths: Set<string>;
  noteFilter: NoteFilter;
  notesChildrenOpen: boolean;
}) {
  const {
    activeTagPath,
    availableTagTree,
    expandedTagPaths,
    noteFilter,
    notesChildrenOpen,
  } = params;

  if (activeTagPath) {
    const activeTagNode = findSidebarTagNode(availableTagTree, activeTagPath);
    if (
      activeTagNode &&
      activeTagNode.children.length > 0 &&
      !expandedTagPaths.has(activeTagPath)
    ) {
      return {
        kind: "expand-tag",
        tagPath: activeTagPath,
      } satisfies SidebarExpandAction;
    }

    return null;
  }

  if (noteFilter === "all" && !notesChildrenOpen) {
    return {
      kind: "expand-notes",
    } satisfies SidebarExpandAction;
  }

  return null;
}
