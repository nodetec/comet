import type { ContextualTagNode } from "@/shared/api/types";

export interface SidebarPaneModelDeps {
  archivedCount: number;
  availableTagPaths: string[];
  availableTagTree: ContextualTagNode[];
  todoCount: number;
  trashedCount: number;
  handleDeleteTag: (path: string) => void;
  handleEmptyTrash: () => void;
  handleExportTag: (path: string) => void;
  handleRenameTag: (fromPath: string, toPath: string) => void;
  handleSelectAll: () => void;
  handleSelectArchive: () => void;
  handleSelectPinned: () => void;
  handleSelectTagPath: (tagPath: string) => void;
  handleSelectToday: () => void;
  handleSelectTodo: () => void;
  handleSelectTrash: () => void;
  handleSelectUntagged: () => void;
  handleSetHideSubtagNotes: (path: string, hideSubtagNotes: boolean) => void;
  handleSetTagPinned: (path: string, pinned: boolean) => void;
}

export function useSidebarPaneModel(deps: SidebarPaneModelDeps) {
  return {
    availableTagPaths: deps.availableTagPaths,
    availableTagTree: deps.availableTagTree,
    archivedCount: deps.archivedCount,
    todoCount: deps.todoCount,
    trashedCount: deps.trashedCount,
    onSelectAll: deps.handleSelectAll,
    onSelectToday: deps.handleSelectToday,
    onSelectTodo: deps.handleSelectTodo,
    onSelectPinned: deps.handleSelectPinned,
    onSelectUntagged: deps.handleSelectUntagged,
    onSelectArchive: deps.handleSelectArchive,
    onSelectTrash: deps.handleSelectTrash,
    onSelectTagPath: deps.handleSelectTagPath,
    onDeleteTag: deps.handleDeleteTag,
    onEmptyTrash: deps.handleEmptyTrash,
    onExportTag: deps.handleExportTag,
    onRenameTag: deps.handleRenameTag,
    onSetTagPinned: deps.handleSetTagPinned,
    onSetTagHideSubtagNotes: deps.handleSetHideSubtagNotes,
  };
}
