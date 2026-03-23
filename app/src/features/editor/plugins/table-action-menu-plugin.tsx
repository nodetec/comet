import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumnAtSelection,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $isTableRowNode,
  $isTableSelection,
  getTableElement,
  getTableObserverFromTableElement,
  TableCellHeaderStates,
  TableCellNode,
  TableSelection,
} from "@lexical/table";
import { $getNearestNodeFromDOMNode, $getSelection } from "lexical";
import {
  EllipsisVertical,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Table,
} from "lucide-react";

function computeSelectionCount(selection: TableSelection): {
  columns: number;
  rows: number;
} {
  const selectionShape = selection.getShape();
  return {
    columns: selectionShape.toX - selectionShape.fromX + 1,
    rows: selectionShape.toY - selectionShape.fromY + 1,
  };
}

function MenuItem({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MenuSeparator() {
  return <div className="bg-border my-1 h-px" />;
}

function TableActionMenu({
  tableCellNode: _tableCellNode,
  onClose,
}: {
  tableCellNode: TableCellNode;
  onClose: () => void;
}) {
  const [editor] = useLexicalComposerContext();
  const [tableCellNode, updateTableCellNode] = useState(_tableCellNode);
  const [selectionCounts, updateSelectionCounts] = useState({
    columns: 1,
    rows: 1,
  });
  const [isHeaderRow, setIsHeaderRow] = useState(false);

  useEffect(() => {
    return editor.registerMutationListener(
      TableCellNode,
      (nodeMutations) => {
        const nodeUpdated =
          nodeMutations.get(tableCellNode.getKey()) === "updated";
        if (nodeUpdated) {
          editor.getEditorState().read(() => {
            updateTableCellNode(tableCellNode.getLatest());
          });
        }
      },
      { skipInitialization: true },
    );
  }, [editor, tableCellNode]);

  useEffect(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isTableSelection(selection)) {
        updateSelectionCounts(computeSelectionCount(selection));
      }
      const headerState = tableCellNode.getHeaderStyles();
      setIsHeaderRow(
        (headerState & TableCellHeaderStates.ROW) === TableCellHeaderStates.ROW,
      );
    });
  }, [editor, tableCellNode]);

  const clearTableSelection = useCallback(() => {
    editor.update(() => {
      if (tableCellNode.isAttached()) {
        const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode);
        const tableElement = getTableElement(
          tableNode,
          editor.getElementByKey(tableNode.getKey()),
        );
        if (tableElement === null) return;

        const tableObserver = getTableObserverFromTableElement(tableElement);
        if (tableObserver !== null) {
          tableObserver.$clearHighlight();
        }
        tableNode.markDirty();
        updateTableCellNode(tableCellNode.getLatest());
      }
    });
  }, [editor, tableCellNode]);

  const insertTableRowAtSelection = useCallback(
    (shouldInsertAfter: boolean) => {
      editor.update(() => {
        for (let i = 0; i < selectionCounts.rows; i++) {
          $insertTableRowAtSelection(shouldInsertAfter);
        }
        onClose();
      });
    },
    [editor, onClose, selectionCounts.rows],
  );

  const insertTableColumnAtSelection = useCallback(
    (shouldInsertAfter: boolean) => {
      editor.update(() => {
        for (let i = 0; i < selectionCounts.columns; i++) {
          $insertTableColumnAtSelection(shouldInsertAfter);
        }
        onClose();
      });
    },
    [editor, onClose, selectionCounts.columns],
  );

  const deleteTableRowAtSelection = useCallback(() => {
    editor.update(() => {
      $deleteTableRowAtSelection();
      onClose();
    });
  }, [editor, onClose]);

  const deleteTableAtSelection = useCallback(() => {
    editor.update(() => {
      const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode);
      tableNode.remove();
      clearTableSelection();
      onClose();
    });
  }, [editor, tableCellNode, clearTableSelection, onClose]);

  const deleteTableColumnAtSelection = useCallback(() => {
    editor.update(() => {
      $deleteTableColumnAtSelection();
      onClose();
    });
  }, [editor, onClose]);

  const toggleTableRowIsHeader = useCallback(() => {
    editor.update(() => {
      const tableNode = $getTableNodeFromLexicalNodeOrThrow(tableCellNode);
      const tableRowIndex = tableCellNode.getIndexWithinParent();
      const tableRows = tableNode.getChildren();
      if (tableRowIndex >= tableRows.length || tableRowIndex < 0) return;

      const tableRow = tableRows[tableRowIndex];
      if (!tableRow || !$isTableRowNode(tableRow)) return;

      const newStyle =
        tableCellNode.getHeaderStyles() ^ TableCellHeaderStates.ROW;
      for (const cell of tableRow.getChildren()) {
        if ($isTableCellNode(cell)) {
          cell.setHeaderStyles(newStyle, TableCellHeaderStates.ROW);
        }
      }

      clearTableSelection();
      onClose();
    });
  }, [editor, tableCellNode, clearTableSelection, onClose]);

  return (
    <div className="bg-popover text-popover-foreground min-w-[180px] rounded-md border p-1 shadow-md">
      {!isHeaderRow && (
        <MenuItem onClick={() => insertTableRowAtSelection(false)}>
          <ArrowUp className="size-4" />
          Insert{" "}
          {selectionCounts.rows === 1
            ? "row"
            : `${selectionCounts.rows} rows`}{" "}
          above
        </MenuItem>
      )}
      <MenuItem onClick={() => insertTableRowAtSelection(true)}>
        <ArrowDown className="size-4" />
        Insert{" "}
        {selectionCounts.rows === 1
          ? "row"
          : `${selectionCounts.rows} rows`}{" "}
        below
      </MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => insertTableColumnAtSelection(false)}>
        <ArrowLeft className="size-4" />
        Insert{" "}
        {selectionCounts.columns === 1
          ? "column"
          : `${selectionCounts.columns} columns`}{" "}
        left
      </MenuItem>
      <MenuItem onClick={() => insertTableColumnAtSelection(true)}>
        <ArrowRight className="size-4" />
        Insert{" "}
        {selectionCounts.columns === 1
          ? "column"
          : `${selectionCounts.columns} columns`}{" "}
        right
      </MenuItem>
      <MenuSeparator />
      {!isHeaderRow && (
        <MenuItem onClick={deleteTableRowAtSelection}>
          <Trash2 className="size-4" />
          Delete row
        </MenuItem>
      )}
      <MenuItem onClick={deleteTableColumnAtSelection}>
        <Trash2 className="size-4" />
        Delete column
      </MenuItem>
      <MenuItem onClick={deleteTableAtSelection}>
        <Trash2 className="size-4" />
        Delete table
      </MenuItem>
      <MenuSeparator />
      <MenuItem onClick={toggleTableRowIsHeader}>
        <Table className="size-4" />
        {isHeaderRow ? "Remove" : "Add"} row header
      </MenuItem>
    </div>
  );
}

function TableCellActionMenuContainer({
  anchorElem,
  loadKey,
}: {
  anchorElem: HTMLElement;
  loadKey: string;
}) {
  const [editor] = useLexicalComposerContext();
  const menuButtonRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isMenuOpenRef = useRef(false);
  const [tableCellNode, setTableMenuCellNode] = useState<TableCellNode | null>(
    null,
  );
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    isMenuOpenRef.current = false;
    setIsMenuOpen(false);
    setTableMenuCellNode(null);

    const menu = menuButtonRef.current;
    if (menu) {
      menu.style.opacity = "0";
      menu.style.pointerEvents = "none";
      menu.style.transform = "translate(0, 0)";
    }
  }, [loadKey]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(e.target as Node)
      ) {
        isMenuOpenRef.current = false;
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isMenuOpen]);

  // Track hovered cell and position the menu
  useEffect(() => {
    const activeCellRef: { current: HTMLElement | null } = { current: null };

    const moveMenu = (cellDOM: HTMLElement) => {
      const menu = menuButtonRef.current;
      if (!menu) return;

      activeCellRef.current = cellDOM;

      const scrollContainer = cellDOM.closest("[data-editor-scroll-container]");
      const containerRect = scrollContainer
        ? scrollContainer.getBoundingClientRect()
        : anchorElem.getBoundingClientRect();

      const cellRect = cellDOM.getBoundingClientRect();

      // Hide if cell is scrolled out of the visible area
      if (
        scrollContainer &&
        (cellRect.bottom < containerRect.top ||
          cellRect.top > containerRect.bottom)
      ) {
        menu.style.opacity = "0";
        menu.style.pointerEvents = "none";
        return;
      }

      const anchorRect = anchorElem.getBoundingClientRect();
      const top = cellRect.top - anchorRect.top + 6;
      const right = anchorRect.right - cellRect.right + 1;
      menu.style.transform = `translate(${-right}px, ${top}px)`;
      menu.style.opacity = "1";
      menu.style.pointerEvents = "auto";
    };

    const hideMenu = () => {
      if (isMenuOpenRef.current) return;
      const menu = menuButtonRef.current;
      if (menu) {
        menu.style.opacity = "0";
        menu.style.pointerEvents = "none";
      }
      activeCellRef.current = null;
      setTableMenuCellNode(null);
    };

    const $readAndShowCellMenu = (cellElem: HTMLElement) => {
      const cellNode = $getNearestNodeFromDOMNode(cellElem);
      if ($isTableCellNode(cellNode)) {
        setTableMenuCellNode(cellNode);
        moveMenu(cellElem);
      }
    };

    let rafId: number | null = null;

    const handlePointerMoveRAF = (target: HTMLElement) => {
      if (!target.closest) return;
      if (isMenuOpenRef.current) return;
      if (menuButtonRef.current?.contains(target)) return;

      const cellElem = target.closest("td, th") as HTMLElement | null;
      if (cellElem) {
        editor.getEditorState().read(
          () => $readAndShowCellMenu(cellElem),
          { editor },
        );
      } else {
        hideMenu();
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (rafId !== null) return;
      const target = event.target as HTMLElement;
      if (!target) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        handlePointerMoveRAF(target);
      });
    };

    const onScroll = () => {
      if (activeCellRef.current) {
        moveMenu(activeCellRef.current);
      }
    };

    let scrollContainer: Element | null = null;

    const removeRootListener = editor.registerRootListener(
      (rootElement, prevRootElement) => {
        prevRootElement?.removeEventListener("pointermove", onPointerMove);
        rootElement?.addEventListener("pointermove", onPointerMove);

        // Listen for scroll on the editor's scroll container
        if (scrollContainer) {
          scrollContainer.removeEventListener("scroll", onScroll);
        }
        scrollContainer =
          rootElement?.closest("[data-editor-scroll-container]") ?? null;
        if (scrollContainer) {
          scrollContainer.addEventListener("scroll", onScroll, {
            passive: true,
          });
        }
      },
    );

    return () => {
      removeRootListener();
      if (scrollContainer) {
        scrollContainer.removeEventListener("scroll", onScroll);
      }
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [editor, anchorElem]);

  const prevTableCellNode = useRef(tableCellNode);

  useEffect(() => {
    if (prevTableCellNode.current !== tableCellNode) {
      setIsMenuOpen(false);
    }
    prevTableCellNode.current = tableCellNode;
  }, [prevTableCellNode, tableCellNode]);

  return (
    <div
      ref={menuButtonRef}
      className="pointer-events-none absolute top-1 right-0 z-10 mx-0 px-0 opacity-0"
      style={{ transform: "translate(0, 0)" }}
    >
      {tableCellNode != null && (
        <>
          <EllipsisVertical
            className="text-muted-foreground hover:text-foreground size-5 cursor-text"
            onMouseDown={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              isMenuOpenRef.current = true;
            }}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setIsMenuOpen((prev) => {
                const next = !prev;
                isMenuOpenRef.current = next;
                return next;
              });
            }}
          />
          {isMenuOpen && (
            <div ref={menuRef} className="absolute top-7 right-0 z-20">
              <TableActionMenu
                tableCellNode={tableCellNode}
                onClose={() => {
                  isMenuOpenRef.current = false;
                  setIsMenuOpen(false);
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TableActionMenuPlugin({
  anchorElem,
  loadKey,
}: {
  anchorElem?: HTMLElement;
  loadKey: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const target = anchorElem ?? document.body;
  return createPortal(
    <TableCellActionMenuContainer anchorElem={target} loadKey={loadKey} />,
    target,
  );
}
