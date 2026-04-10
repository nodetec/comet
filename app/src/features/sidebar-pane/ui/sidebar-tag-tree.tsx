import { type MouseEvent } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { ask } from "@tauri-apps/plugin-dialog";
import { Menu } from "@tauri-apps/api/menu";
import { ChevronRight, Hash, Pin } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { type ContextualTagNode } from "@/shared/api/types";
import {
  SIDEBAR_ITEM_STATUS_ICON_CLASS_NAME,
  SIDEBAR_TAG_ICON_CLASS_NAME,
  sidebarItemClasses,
} from "@/features/sidebar-pane/ui/sidebar-utils";
import {
  SidebarCollapse,
  SidebarIndentedContent,
  SidebarRowContent,
} from "@/features/sidebar-pane/ui/sidebar-shared";

async function showTagContextMenu(
  event: MouseEvent<HTMLDivElement | HTMLButtonElement>,
  node: ContextualTagNode,
  ctx: {
    onDeleteTag(path: string): void;
    onExportTag(path: string): void;
    onOpenRenameTagDialog(path: string): void;
    onSetTagPinned(path: string, pinned: boolean): void;
  },
) {
  event.preventDefault();
  const isRootTag = !node.path.includes("/");

  const items: Array<
    { item: "Separator" } | { id: string; text: string; action: () => void }
  > = [];

  if (isRootTag) {
    items.push({
      id: `pin-${node.path}`,
      text: node.pinned ? "Unpin Tag" : "Pin Tag",
      action: () => ctx.onSetTagPinned(node.path, !node.pinned),
    });
  }

  items.push(
    {
      id: `rename-${node.path}`,
      text: "Rename Tag",
      action: () => ctx.onOpenRenameTagDialog(node.path),
    },
    {
      id: `export-${node.path}`,
      text: "Export Tag",
      action: () => ctx.onExportTag(node.path),
    },
    { item: "Separator" as const },
    {
      id: `delete-${node.path}`,
      text: "Delete Tag",
      action: () => {
        void (async () => {
          const confirmed = await ask(
            `Delete "${node.path}" from all matching notes?`,
            {
              title: "Delete Tag",
              kind: "warning",
              okLabel: "Delete",
              cancelLabel: "Cancel",
            },
          );
          if (confirmed) {
            ctx.onDeleteTag(node.path);
          }
        })();
      },
    },
  );

  const menu = await Menu.new({ items });

  try {
    await menu.popup(new LogicalPosition(event.clientX, event.clientY));
  } finally {
    await menu.close();
  }
}

export function TagTree({
  activeTagPath,
  expandedTagPaths,
  isFocused,
  nodes,
  onDeleteTag,
  onExportTag,
  onOpenRenameTagDialog,
  onSetTagPinned,
  onToggleExpanded,
  onSelectTagPath,
  onSidebarRowFocus,
  onTagRowRef,
}: {
  activeTagPath: string | null;
  expandedTagPaths: Set<string>;
  isFocused: boolean;
  nodes: ContextualTagNode[];
  onDeleteTag(path: string): void;
  onExportTag(path: string): void;
  onOpenRenameTagDialog(path: string): void;
  onSetTagPinned(path: string, pinned: boolean): void;
  onToggleExpanded(path: string): void;
  onSelectTagPath(path: string): void;
  onSidebarRowFocus(): void;
  onTagRowRef(path: string, element: HTMLElement | null): void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {nodes.map((node) => {
        const isActive = activeTagPath === node.path;
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedTagPaths.has(node.path);
        const indentLevel = Math.max(0, node.depth - 1);

        return (
          <div key={node.path}>
            <div
              className={cn(sidebarItemClasses(isActive, isFocused), "group")}
              data-comet-sidebar-active={isActive ? "true" : undefined}
              data-comet-sidebar-tag-path={node.path}
              onClick={() => onSelectTagPath(node.path)}
              onContextMenu={(event) =>
                void showTagContextMenu(event, node, {
                  onDeleteTag,
                  onExportTag,
                  onOpenRenameTagDialog,
                  onSetTagPinned,
                })
              }
              onFocus={onSidebarRowFocus}
              ref={(element) => onTagRowRef(node.path, element)}
              tabIndex={-1}
            >
              <SidebarIndentedContent indentLevel={indentLevel}>
                <SidebarRowContent
                  chevron={
                    hasChildren ? (
                      <button
                        className="flex size-5 items-center justify-center rounded-sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleExpanded(node.path);
                        }}
                        type="button"
                      >
                        <ChevronRight
                          className={cn(
                            "size-4 transition-transform",
                            isExpanded ? "rotate-90" : "rotate-0",
                          )}
                        />
                      </button>
                    ) : undefined
                  }
                  icon={
                    <Hash
                      className={cn(
                        "size-4 shrink-0",
                        isActive
                          ? "text-sidebar-foreground"
                          : SIDEBAR_TAG_ICON_CLASS_NAME,
                      )}
                    />
                  }
                  label={node.label}
                  status={
                    node.pinned ? (
                      <Pin className={SIDEBAR_ITEM_STATUS_ICON_CLASS_NAME} />
                    ) : undefined
                  }
                />
              </SidebarIndentedContent>
            </div>
            <SidebarCollapse open={hasChildren && isExpanded}>
              <TagTree
                activeTagPath={activeTagPath}
                expandedTagPaths={expandedTagPaths}
                isFocused={isFocused}
                nodes={node.children}
                onDeleteTag={onDeleteTag}
                onExportTag={onExportTag}
                onOpenRenameTagDialog={onOpenRenameTagDialog}
                onSetTagPinned={onSetTagPinned}
                onToggleExpanded={onToggleExpanded}
                onSelectTagPath={onSelectTagPath}
                onSidebarRowFocus={onSidebarRowFocus}
                onTagRowRef={onTagRowRef}
              />
            </SidebarCollapse>
          </div>
        );
      })}
    </div>
  );
}
