import { type KeyboardEvent as ReactKeyboardEvent } from "react";

import { getNoteListNavigationDirectionForKey } from "@/shared/lib/note-list-navigation";
import {
  getAdjacentSidebarNavigationItem,
  getSidebarCollapseAction,
  getSidebarExpandAction,
  type SidebarNavigationItem,
} from "@/features/sidebar-pane/lib/sidebar-navigation";
import { dispatchFocusNotesPane } from "@/shared/lib/pane-navigation";
import { useShellNavigationStore } from "@/shared/stores/use-shell-navigation-store";
import { type ContextualTagNode, type NoteFilter } from "@/shared/api/types";

function selectSidebarNavigationItem(params: {
  item: ReturnType<typeof getAdjacentSidebarNavigationItem>;
  onSelectAll: () => void;
  onSelectArchive: () => void;
  onSelectSidebarTagPath: (tagPath: string) => void;
  onSelectPinned: () => void;
  onSelectToday: () => void;
  onSelectTodo: () => void;
  onSelectTrash: () => void;
  onSelectUntagged: () => void;
}) {
  const {
    item,
    onSelectAll,
    onSelectArchive,
    onSelectSidebarTagPath,
    onSelectPinned,
    onSelectToday,
    onSelectTodo,
    onSelectTrash,
    onSelectUntagged,
  } = params;

  if (!item) {
    return;
  }

  if (item.kind === "tag") {
    onSelectSidebarTagPath(item.tagPath);
    return;
  }

  switch (item.filter) {
    case "all": {
      onSelectAll();
      break;
    }
    case "today": {
      onSelectToday();
      break;
    }
    case "todo": {
      onSelectTodo();
      break;
    }
    case "pinned": {
      onSelectPinned();
      break;
    }
    case "untagged": {
      onSelectUntagged();
      break;
    }
    case "archive": {
      onSelectArchive();
      break;
    }
    case "trash": {
      onSelectTrash();
      break;
    }
  }
}

function applySidebarCollapseAction(params: {
  action: ReturnType<typeof getSidebarCollapseAction>;
  onSelectAll: () => void;
  onSelectSidebarTagPath: (tagPath: string) => void;
  setNotesChildrenOpen: (open: boolean) => void;
  toggleExpandedTagPath: (path: string) => void;
}) {
  const {
    action,
    onSelectAll,
    onSelectSidebarTagPath,
    setNotesChildrenOpen,
    toggleExpandedTagPath,
  } = params;
  if (!action) {
    return;
  }

  if (action.kind === "collapse-notes") {
    setNotesChildrenOpen(false);
    onSelectAll();
    return;
  }

  toggleExpandedTagPath(action.tagPath);
  if (action.nextTagPath) {
    onSelectSidebarTagPath(action.nextTagPath);
  }
}

function applySidebarExpandAction(params: {
  action: ReturnType<typeof getSidebarExpandAction>;
  setNotesChildrenOpen: (open: boolean) => void;
  toggleExpandedTagPath: (path: string) => void;
}) {
  const { action, setNotesChildrenOpen, toggleExpandedTagPath } = params;
  if (!action) {
    return;
  }

  if (action.kind === "expand-notes") {
    setNotesChildrenOpen(true);
    return;
  }

  toggleExpandedTagPath(action.tagPath);
}

export interface SidebarKeyboardNavDeps {
  activeTagPath: string | null;
  availableTagTree: ContextualTagNode[];
  expandedTagPaths: Set<string>;
  noteFilter: NoteFilter;
  notesChildrenOpen: boolean;
  sidebarNavigationItems: SidebarNavigationItem[];
  activeSidebarItemId: string;
  sidebarRowRefs: React.RefObject<Map<string, HTMLElement | null>>;
  onSelectAll: () => void;
  onSelectArchive: () => void;
  onSelectPinned: () => void;
  onSelectToday: () => void;
  onSelectTodo: () => void;
  onSelectTrash: () => void;
  onSelectUntagged: () => void;
  onSelectSidebarTagPath: (tagPath: string) => void;
  setNotesChildrenOpen: (open: boolean) => void;
  toggleExpandedTagPath: (path: string) => void;
}

export function useSidebarKeyboardNav(deps: SidebarKeyboardNavDeps) {
  const {
    activeTagPath,
    availableTagTree,
    expandedTagPaths,
    noteFilter,
    notesChildrenOpen,
    sidebarNavigationItems,
    activeSidebarItemId,
    sidebarRowRefs,
    onSelectAll,
    onSelectArchive,
    onSelectPinned,
    onSelectToday,
    onSelectTodo,
    onSelectTrash,
    onSelectUntagged,
    onSelectSidebarTagPath,
    setNotesChildrenOpen,
    toggleExpandedTagPath,
  } = deps;

  const handleSidebarKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const lowerKey = event.key.toLowerCase();
    if (event.key === "Enter" || lowerKey === "o") {
      event.preventDefault();
      const hasSelection = !!useShellNavigationStore.getState().selectedNoteId;
      dispatchFocusNotesPane({
        selection: hasSelection ? "selected" : "first",
      });
      return;
    }

    if (lowerKey === "h" || event.key === "ArrowLeft") {
      const collapseAction = getSidebarCollapseAction({
        activeTagPath,
        availableTagTree,
        expandedTagPaths,
        noteFilter,
        notesChildrenOpen,
      });
      if (!collapseAction) {
        return;
      }

      event.preventDefault();
      applySidebarCollapseAction({
        action: collapseAction,
        onSelectAll,
        onSelectSidebarTagPath,
        setNotesChildrenOpen,
        toggleExpandedTagPath,
      });
      return;
    }

    if (lowerKey === "l" || event.key === "ArrowRight") {
      const expandAction = getSidebarExpandAction({
        activeTagPath,
        availableTagTree,
        expandedTagPaths,
        noteFilter,
        notesChildrenOpen,
      });
      if (!expandAction) {
        return;
      }

      event.preventDefault();
      applySidebarExpandAction({
        action: expandAction,
        setNotesChildrenOpen,
        toggleExpandedTagPath,
      });
      return;
    }

    const direction = getNoteListNavigationDirectionForKey(event.key);
    if (!direction) {
      return;
    }

    const nextItem = getAdjacentSidebarNavigationItem(
      sidebarNavigationItems,
      activeSidebarItemId,
      direction,
    );
    if (!nextItem) {
      return;
    }

    event.preventDefault();
    sidebarRowRefs.current
      .get(nextItem.id)
      ?.scrollIntoView({ block: "nearest" });
    selectSidebarNavigationItem({
      item: nextItem,
      onSelectAll,
      onSelectArchive,
      onSelectPinned,
      onSelectSidebarTagPath,
      onSelectToday,
      onSelectTodo,
      onSelectTrash,
      onSelectUntagged,
    });
  };

  return handleSidebarKeyDown;
}
