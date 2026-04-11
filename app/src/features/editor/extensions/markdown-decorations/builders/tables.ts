import { syntaxTree } from "@codemirror/language";
import {
  Annotation,
  EditorSelection,
  EditorState,
  RangeSetBuilder,
  type StateEffect,
  StateField,
  Transaction,
  type Extension,
} from "@codemirror/state";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { redo, undo } from "@codemirror/commands";
import {
  Decoration,
  drawSelection,
  EditorView,
  keymap,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

import {
  getCanonicalTableTextIfChanged,
  MarkdownTable,
  parseMarkdownTable,
} from "@/features/editor/extensions/tables/markdown-table";
import {
  activeTableCellField,
  clearActiveTableCellEffect,
  getActiveTableCell,
  getResolvedActiveTableCell,
  isSameActiveTableCell,
  resolvedActiveTableCellField,
  resolveTableByFrom,
  setActiveTableCellEffect,
} from "@/features/editor/extensions/tables/state";
import {
  activeCellToCoords,
  cellSelectionField,
  cellSelectionTransitionAnnotation,
  clearCellSelectionEffect,
  fromUnifiedRow,
  getCellSelection,
  isCellInRect,
  moveCellCoords,
  normalizeCellCoords,
  selectionFromRect,
  setCellSelectionEffect,
  toSelectionRect,
  toUnifiedRow,
  type CellCoords,
  type CellSelection,
  type CellSelectionDirection,
} from "@/features/editor/extensions/tables/cell-selection-state";
import {
  clampSelection,
  sanitizeLocalText,
  toLocalSelection,
  toRootSelection,
  unsanitizeRootText,
} from "@/features/editor/extensions/tables/text-codec";
import {
  findEditorScrollContainer,
  lockEditorScrollPosition,
} from "@/features/editor/lib/view-utils";
import type {
  ActiveTableCell,
  ParsedMarkdownTable,
  ResolvedActiveTableCell,
} from "@/features/editor/extensions/tables/types";

const ACTIVE_CELL_HOST_CLASS = "cm-md-table-cell-editor";
const CELL_CLASS = "cm-md-table-cell";
const CELL_CONTENT_CLASS = "cm-md-table-cell-content";
const CELL_MENU_TRIGGER_CLASS = "cm-md-table-cell-menu-trigger";
const SECTION_ATTR = "data-table-section";
const ROW_ATTR = "data-table-row";
const COL_ATTR = "data-table-col";
const TABLE_HASH_ATTR = "data-table-hash";
const TABLE_FROM_ATTR = "data-table-from";
const TABLE_TO_ATTR = "data-table-to";
const normalizeBeforeEditAnnotation = Annotation.define<boolean>();
const syncTableEditAnnotation = Annotation.define<boolean>();
type PendingCursorPosition = "end" | "lastLineStart" | "mapped" | "start";

type PendingTableCellOpen = {
  activeCell: ActiveTableCell;
  clickCoords?: { x: number; y: number };
  cursorPos: PendingCursorPosition;
  localSelection?: {
    anchor: number;
    head: number;
  };
};

type TableOperationTarget = Pick<ActiveTableCell, "col" | "row" | "section">;
type ResolvedTableAtPosition = {
  table: ParsedMarkdownTable;
  tableFrom: number;
  tableTo: number;
};

type TableCellMenuContext = {
  activeCell: ActiveTableCell;
  canDeleteColumn: boolean;
  canDeleteRow: boolean;
  view: EditorView;
};

const pendingTableCellOpens = new WeakMap<EditorView, PendingTableCellOpen>();
const pendingTableNormalizations = new WeakSet<EditorView>();
const tableHeightCache = new Map<string, number>();
const tableResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();
const tableCellMenus = new WeakMap<EditorView, TableCellMenuController>();
const pendingTableCellMenus = new WeakMap<
  EditorView,
  Promise<TableCellMenuController>
>();

function buildClipboardGrid(text: string): string[][] {
  const markdownTable = MarkdownTable.parse(text);
  if (markdownTable) {
    return [
      [...markdownTable.headerCells],
      ...markdownTable.bodyRows.map((row) => [...row]),
    ];
  }

  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.split("\t"));
}

function createCellContent(text: string): HTMLElement {
  const content = document.createElement("div");
  content.className = CELL_CONTENT_CLASS;
  content.textContent = unsanitizeRootText(text);
  return content;
}

function createCellContentFromLocalText(text: string): HTMLElement {
  const content = document.createElement("div");
  content.className = CELL_CONTENT_CLASS;
  content.textContent = text;
  return content;
}

function createCellMenuTrigger(
  cell: HTMLElement,
  view: EditorView,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = CELL_MENU_TRIGGER_CLASS;
  button.type = "button";
  button.tabIndex = -1;
  button.textContent = "\u22EE";
  button.setAttribute("aria-label", "Table cell menu");
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    nestedEditors.get(view)?.syncSelectionToMain();
    void showTableCellMenu(button, cell, view);
  });
  return button;
}

function copyCellSelection(selection: CellSelection, view: EditorView) {
  const resolvedTable = resolveTableByFrom(view.state, selection.tableFrom);
  if (!resolvedTable) {
    return null;
  }

  const rect = toSelectionRect(selection);
  const rows: string[][] = [];

  for (
    let unifiedRow = rect.minRow;
    unifiedRow <= rect.maxRow;
    unifiedRow += 1
  ) {
    const rowCells: string[] = [];
    const sourceRow =
      unifiedRow === 0
        ? resolvedTable.table.headerCells
        : (resolvedTable.table.bodyRows[unifiedRow - 1] ?? []);

    for (let col = rect.minCol; col <= rect.maxCol; col += 1) {
      rowCells.push(sourceRow[col] ?? "");
    }

    rows.push(rowCells);
  }

  if (rows.length === 0) {
    return null;
  }

  const selectionIncludesHeader = rect.minRow === 0;
  const headerCells = rows[0] ?? [];
  const bodyRows = rows.slice(1);
  const alignments = selectionIncludesHeader
    ? resolvedTable.table.alignments.slice(rect.minCol, rect.maxCol + 1)
    : headerCells.map(() => null);

  return MarkdownTable.fromParts({
    alignments,
    bodyRows,
    headerCells,
  }).serialize();
}

function clearSelectedCells(selection: CellSelection, view: EditorView) {
  const resolvedTable = resolveTableByFrom(view.state, selection.tableFrom);
  if (!resolvedTable) {
    return false;
  }

  const nextTable = MarkdownTable.fromParts({
    alignments: resolvedTable.table.alignments,
    bodyRows: resolvedTable.table.bodyRows,
    headerCells: resolvedTable.table.headerCells,
  }).clearRect(toSelectionRect(selection));

  view.dispatch({
    changes: {
      from: resolvedTable.tableFrom,
      insert: nextTable.serialize(),
      to: resolvedTable.tableTo,
    },
    effects: setCellSelectionEffect.of(selection),
    scrollIntoView: false,
  });
  return true;
}

function pasteIntoCellSelection(
  clipboardText: string,
  selection: CellSelection,
  view: EditorView,
) {
  const resolvedTable = resolveTableByFrom(view.state, selection.tableFrom);
  if (!resolvedTable) {
    return false;
  }

  const cells = buildClipboardGrid(clipboardText);
  if (cells.length === 0 || cells[0]?.length === 0) {
    return false;
  }

  const rect = toSelectionRect(selection);
  const nextTable = MarkdownTable.fromParts({
    alignments: resolvedTable.table.alignments,
    bodyRows: resolvedTable.table.bodyRows,
    headerCells: resolvedTable.table.headerCells,
  }).pasteGrid(fromUnifiedRow(rect.minRow, rect.minCol), cells);
  const nextRect = {
    maxCol: rect.minCol + (cells[0]?.length ?? 1) - 1,
    maxRow: rect.minRow + cells.length - 1,
    minCol: rect.minCol,
    minRow: rect.minRow,
  };

  view.dispatch({
    changes: {
      from: resolvedTable.tableFrom,
      insert: nextTable.serialize(),
      to: resolvedTable.tableTo,
    },
    effects: setCellSelectionEffect.of(
      selectionFromRect(resolvedTable.tableFrom, nextRect),
    ),
    scrollIntoView: false,
  });
  return true;
}

function createTableHash(table: ParsedMarkdownTable): string {
  return JSON.stringify([table.headerCells, table.bodyRows, table.alignments]);
}

function findCellCoordsForRelativePos(
  table: ParsedMarkdownTable,
  relativePos: number,
) {
  for (const [col, range] of table.cellRanges.headers.entries()) {
    if (relativePos >= range.editableFrom && relativePos <= range.editableTo) {
      return { col, row: 0, section: "header" as const };
    }
  }

  for (const [row, rowRanges] of table.cellRanges.rows.entries()) {
    for (const [col, range] of rowRanges.entries()) {
      if (
        relativePos >= range.editableFrom &&
        relativePos <= range.editableTo
      ) {
        return { col, row, section: "body" as const };
      }
    }
  }

  return null;
}

function resolveMarkdownTableAtCell(
  activeCell: ActiveTableCell,
  view: EditorView,
) {
  const resolvedTable = resolveTableByFrom(view.state, activeCell.tableFrom);
  if (!resolvedTable) {
    return null;
  }

  const markdownTable = MarkdownTable.parse(
    view.state.sliceDoc(resolvedTable.tableFrom, resolvedTable.tableTo),
  );
  if (!markdownTable) {
    return null;
  }

  return {
    markdownTable,
    resolvedTable,
  };
}

function getEditableRangeForCell(
  activeCell: ActiveTableCell,
  table: ParsedMarkdownTable,
) {
  return activeCell.section === "header"
    ? table.cellRanges.headers[activeCell.col]
    : table.cellRanges.rows[activeCell.row]?.[activeCell.col];
}

function selectionForActiveTableCell(
  activeCell: ActiveTableCell,
  table: ParsedMarkdownTable,
  tableFrom: number,
) {
  const range = getEditableRangeForCell(activeCell, table);
  if (!range) {
    return null;
  }

  return EditorSelection.cursor(tableFrom + range.editableFrom);
}

function dispatchActiveTableCellSelection(
  activeCell: ActiveTableCell,
  view: EditorView,
) {
  const resolvedTable = resolveTableByFrom(view.state, activeCell.tableFrom);
  const selection = resolvedTable
    ? selectionForActiveTableCell(
        activeCell,
        resolvedTable.table,
        resolvedTable.tableFrom,
      )
    : null;

  view.dispatch({
    effects: setActiveTableCellEffect.of(activeCell),
    selection: selection ?? undefined,
    scrollIntoView: false,
  });
}

function setMainSelectionToTableCell(
  activeCell: ActiveTableCell,
  view: EditorView,
) {
  const resolvedTable = resolveTableByFrom(view.state, activeCell.tableFrom);
  const selection = resolvedTable
    ? selectionForActiveTableCell(
        activeCell,
        resolvedTable.table,
        resolvedTable.tableFrom,
      )
    : null;
  if (!selection) {
    return false;
  }

  const currentSelection = view.state.selection.main;
  if (
    currentSelection.anchor === selection.anchor &&
    currentSelection.head === selection.head
  ) {
    return true;
  }

  view.dispatch({
    selection,
    annotations: Transaction.addToHistory.of(false),
    scrollIntoView: false,
  });
  return true;
}

function isUndoRedoTransaction(transaction: Transaction) {
  return transaction.isUserEvent("undo") || transaction.isUserEvent("redo");
}

function transactionChangesOutsideCell(
  transaction: Transaction,
  resolved: ResolvedActiveTableCell,
) {
  let outsideCell = false;

  transaction.changes.iterChanges((fromA, toA) => {
    if (outsideCell) {
      return;
    }

    if (fromA < resolved.editableFrom || toA > resolved.editableTo) {
      outsideCell = true;
    }
  });

  return outsideCell;
}

function transactionRequiresTableRebuild(
  transaction: Transaction,
  resolved: ResolvedActiveTableCell | null,
) {
  if (!resolved || !isUndoRedoTransaction(transaction)) {
    return false;
  }

  return transactionChangesOutsideCell(transaction, resolved);
}

function resolveTableAtPosition(
  pos: number,
  state: EditorState,
): ResolvedTableAtPosition | null {
  let resolvedTable: ResolvedTableAtPosition | null = null;

  syntaxTree(state).iterate({
    enter(node) {
      if (
        resolvedTable ||
        node.name !== "Table" ||
        pos < node.from ||
        pos > node.to
      ) {
        return;
      }

      const table = parseMarkdownTable(state.sliceDoc(node.from, node.to));
      if (!table) {
        return;
      }

      resolvedTable = {
        table,
        tableFrom: node.from,
        tableTo: node.to,
      };
    },
  });

  return resolvedTable;
}

function activateCellAtPosition(
  clearIfOutside: boolean,
  pos: number,
  view: EditorView,
) {
  const resolvedTable = resolveTableAtPosition(pos, view.state);
  if (!resolvedTable) {
    if (clearIfOutside) {
      view.dispatch({
        effects: clearActiveTableCellEffect.of(),
        selection: EditorSelection.cursor(pos),
        scrollIntoView: false,
      });
    }
    return false;
  }

  const relativePos = pos - resolvedTable.tableFrom;
  const activeCell = getActiveTableCell(view.state);
  const fallbackCoords =
    activeCell && activeCell.tableFrom === resolvedTable.tableFrom
      ? activeCellToCoords(activeCell)
      : { col: 0, row: 0, section: "body" as const };
  const targetCoords =
    findCellCoordsForRelativePos(resolvedTable.table, relativePos) ??
    fallbackCoords;
  const nextActiveCell: ActiveTableCell = {
    ...targetCoords,
    tableFrom: resolvedTable.tableFrom,
  };
  const range = getEditableRangeForCell(nextActiveCell, resolvedTable.table);
  if (!range) {
    return false;
  }

  rememberPendingTableCellOpen(view, nextActiveCell, "mapped", {
    anchor: pos - resolvedTable.tableFrom - range.editableFrom,
    head: pos - resolvedTable.tableFrom - range.editableFrom,
  });
  view.dispatch({
    selection: EditorSelection.cursor(
      resolvedTable.tableFrom + range.editableFrom,
    ),
    effects: setActiveTableCellEffect.of(nextActiveCell),
    scrollIntoView: false,
  });
  return true;
}

function runTableOperationAtCell(
  activeCell: ActiveTableCell,
  computeTargetCell: (cell: ActiveTableCell) => TableOperationTarget,
  cursorPos: PendingCursorPosition,
  operation: (table: MarkdownTable, cell: ActiveTableCell) => MarkdownTable,
  preserveSelection: boolean,
  view: EditorView,
) {
  const resolved = resolveMarkdownTableAtCell(activeCell, view);
  if (!resolved) {
    return false;
  }

  const nextTable = operation(resolved.markdownTable, activeCell);
  if (nextTable === resolved.markdownTable) {
    return false;
  }
  const nextTableText = nextTable.serialize();
  const nextParsedTable = parseMarkdownTable(nextTableText);
  if (!nextParsedTable) {
    return false;
  }

  const nextActiveCell = clampActiveTableCellTarget(
    computeTargetCell(activeCell),
    nextTable,
    resolved.resolvedTable.tableFrom,
  );
  const nextRange = getEditableRangeForCell(nextActiveCell, nextParsedTable);
  if (!nextRange) {
    return false;
  }

  rememberPendingTableCellOpen(view, nextActiveCell, cursorPos);
  view.dispatch({
    changes: {
      from: resolved.resolvedTable.tableFrom,
      insert: nextTableText,
      to: resolved.resolvedTable.tableTo,
    },
    selection: preserveSelection
      ? undefined
      : EditorSelection.cursor(
          resolved.resolvedTable.tableFrom + nextRange.editableFrom,
        ),
    effects: setActiveTableCellEffect.of(nextActiveCell),
    scrollIntoView: false,
  });
  return true;
}

function runPassiveTableOperationAtCell(
  activeCell: ActiveTableCell,
  operation: (table: MarkdownTable, cell: ActiveTableCell) => MarkdownTable,
  view: EditorView,
) {
  const resolved = resolveMarkdownTableAtCell(activeCell, view);
  if (!resolved) {
    return false;
  }

  const nextTable = operation(resolved.markdownTable, activeCell);
  if (nextTable === resolved.markdownTable) {
    return false;
  }

  view.dispatch({
    changes: {
      from: resolved.resolvedTable.tableFrom,
      insert: nextTable.serialize(),
      to: resolved.resolvedTable.tableTo,
    },
    scrollIntoView: false,
  });
  return true;
}

function deleteTableAtCell(activeCell: ActiveTableCell, view: EditorView) {
  const resolved = resolveMarkdownTableAtCell(activeCell, view);
  if (!resolved) {
    return false;
  }

  view.dispatch({
    changes: {
      from: resolved.resolvedTable.tableFrom,
      insert: "",
      to: resolved.resolvedTable.tableTo,
    },
    effects: [clearActiveTableCellEffect.of(), clearCellSelectionEffect.of()],
    selection: EditorSelection.cursor(resolved.resolvedTable.tableFrom),
    scrollIntoView: false,
  });
  return true;
}

class TableCellMenuController {
  private context: TableCellMenuContext | null = null;
  private constructor(
    private readonly deleteColumnItem: MenuItem,
    private readonly deleteRowItem: MenuItem,
    private readonly items: (MenuItem | PredefinedMenuItem)[],
    private readonly menu: Menu,
  ) {}

  static async create() {
    const controllerRef: { current: TableCellMenuController | null } = {
      current: null,
    };
    const getContext = () => controllerRef.current?.context ?? null;
    const run = (
      operation: (table: MarkdownTable, cell: ActiveTableCell) => MarkdownTable,
    ) => {
      const context = getContext();
      if (!context) {
        return;
      }

      runPassiveTableOperationAtCell(
        context.activeCell,
        operation,
        context.view,
      );
    };

    const rowAboveItem = await MenuItem.new({
      id: "table-row-above",
      text: "Insert Row Above",
      action: () => {
        run((table, currentCell) =>
          table.insertRowRelativeTo(
            currentCell.section,
            currentCell.row,
            "before",
          ),
        );
      },
    });
    const rowBelowItem = await MenuItem.new({
      id: "table-row-below",
      text: "Insert Row Below",
      action: () => {
        run((table, currentCell) =>
          table.insertRowRelativeTo(
            currentCell.section,
            currentCell.row,
            "after",
          ),
        );
      },
    });
    const separatorOne = await PredefinedMenuItem.new({ item: "Separator" });
    const columnLeftItem = await MenuItem.new({
      id: "table-column-left",
      text: "Insert Column Left",
      action: () => {
        run((table, currentCell) =>
          table.insertColumn(currentCell.col, "before"),
        );
      },
    });
    const columnRightItem = await MenuItem.new({
      id: "table-column-right",
      text: "Insert Column Right",
      action: () => {
        run((table, currentCell) =>
          table.insertColumn(currentCell.col, "after"),
        );
      },
    });
    const separatorTwo = await PredefinedMenuItem.new({ item: "Separator" });
    const deleteRowItem = await MenuItem.new({
      id: "table-delete-row",
      text: "Delete Row",
      action: () => {
        run((table, currentCell) =>
          table.deleteRowAt(currentCell.section, currentCell.row),
        );
      },
    });
    const deleteColumnItem = await MenuItem.new({
      id: "table-delete-column",
      text: "Delete Column",
      action: () => {
        run((table, currentCell) => table.deleteColumn(currentCell.col));
      },
    });
    const separatorThree = await PredefinedMenuItem.new({ item: "Separator" });
    const deleteTableItem = await MenuItem.new({
      id: "table-delete-table",
      text: "Delete Table",
      action: () => {
        const context = getContext();
        if (!context) {
          return;
        }

        deleteTableAtCell(context.activeCell, context.view);
      },
    });

    const items: (MenuItem | PredefinedMenuItem)[] = [
      rowAboveItem,
      rowBelowItem,
      separatorOne,
      columnLeftItem,
      columnRightItem,
      separatorTwo,
      deleteRowItem,
      deleteColumnItem,
      separatorThree,
      deleteTableItem,
    ];
    const menu = await Menu.new({ items });
    const controller = new TableCellMenuController(
      deleteColumnItem,
      deleteRowItem,
      items,
      menu,
    );
    controllerRef.current = controller;

    return controller;
  }

  async destroy() {
    await this.menu.close();
    await Promise.allSettled(this.items.map((item) => item.close()));
  }

  async popup(button: HTMLButtonElement, context: TableCellMenuContext) {
    this.context = context;
    await Promise.all([
      this.deleteColumnItem.setEnabled(context.canDeleteColumn),
      this.deleteRowItem.setEnabled(context.canDeleteRow),
    ]);

    const rect = button.getBoundingClientRect();
    await this.menu.popup(new LogicalPosition(rect.left, rect.bottom));
  }
}

async function getTableCellMenu(view: EditorView) {
  const existing = tableCellMenus.get(view);
  if (existing) {
    return existing;
  }

  const pending = pendingTableCellMenus.get(view);
  if (pending) {
    return pending;
  }

  const next = TableCellMenuController.create().then((controller) => {
    pendingTableCellMenus.delete(view);
    tableCellMenus.set(view, controller);
    return controller;
  });
  pendingTableCellMenus.set(view, next);
  return next;
}

function destroyTableCellMenu(view: EditorView) {
  const existing = tableCellMenus.get(view);
  if (existing) {
    tableCellMenus.delete(view);
    void existing.destroy();
  }

  const pending = pendingTableCellMenus.get(view);
  if (pending) {
    pendingTableCellMenus.delete(view);
    void pending.then((controller) => {
      tableCellMenus.delete(view);
      void controller.destroy();
    });
  }
}

async function showTableCellMenu(
  button: HTMLButtonElement,
  cell: HTMLElement,
  view: EditorView,
) {
  const activeCell = getCellTargetData(cell);
  if (!activeCell) {
    return;
  }

  const resolved = resolveMarkdownTableAtCell(activeCell, view);
  if (!resolved) {
    return;
  }

  if (!nestedEditors.get(view)?.syncSelectionToMain()) {
    setMainSelectionToTableCell(activeCell, view);
  }

  const menu = await getTableCellMenu(view);
  await menu.popup(button, {
    activeCell,
    canDeleteColumn: resolved.markdownTable.columnCount > 1,
    canDeleteRow:
      activeCell.section !== "header" ||
      resolved.markdownTable.bodyRows.length > 0,
    view,
  });
}

function requestTableMeasurement(
  container: HTMLElement,
  hash: string,
  tableFrom: number,
  view: EditorView,
) {
  view.requestMeasure({
    key: `${hash}:${tableFrom}`,
    read: () => {
      if (!container.isConnected) {
        return null;
      }

      return container.getBoundingClientRect().height;
    },
    write: (height) => {
      if (typeof height === "number" && height > 0) {
        tableHeightCache.set(hash, height);
      }
    },
  });
}

class MarkdownTableWidget extends WidgetType {
  private readonly hash: string;

  constructor(
    private readonly table: ParsedMarkdownTable,
    private readonly tableFrom: number,
    private readonly tableTo: number,
  ) {
    super();
    this.hash = createTableHash(table);
  }

  override eq(_other: WidgetType): boolean {
    return false;
  }

  override ignoreEvent(event: Event): boolean {
    return (
      event.target instanceof HTMLElement &&
      event.target.closest(`.${ACTIVE_CELL_HOST_CLASS}`) != null
    );
  }

  override get estimatedHeight() {
    return (
      tableHeightCache.get(this.hash) ??
      Math.max(48, (this.table.bodyRows.length + 1) * 40)
    );
  }

  override coordsAt(dom: HTMLElement, pos: number, _side: number) {
    const coords = findCellCoordsForRelativePos(
      this.table,
      pos - this.tableFrom,
    );
    if (!coords) {
      return null;
    }

    const selector = [
      `.${CELL_CLASS}`,
      `[${SECTION_ATTR}="${coords.section}"]`,
      `[${ROW_ATTR}="${coords.row}"]`,
      `[${COL_ATTR}="${coords.col}"]`,
    ].join("");
    const cell = dom.querySelector(selector);
    return cell instanceof HTMLElement ? cell.getBoundingClientRect() : null;
  }

  override destroy(dom: HTMLElement) {
    const observer = tableResizeObservers.get(dom);
    if (observer) {
      observer.disconnect();
      tableResizeObservers.delete(dom);
    }
  }

  override updateDOM(dom: HTMLElement, view: EditorView) {
    const currentHash = dom.getAttribute(TABLE_HASH_ATTR);
    if (currentHash !== this.hash) {
      return false;
    }

    dom.setAttribute(TABLE_FROM_ATTR, String(this.tableFrom));
    dom.setAttribute(TABLE_TO_ATTR, String(this.tableTo));
    for (const cell of dom.querySelectorAll(`.${CELL_CLASS}`)) {
      if (cell instanceof HTMLElement) {
        cell.setAttribute(TABLE_FROM_ATTR, String(this.tableFrom));
      }
    }

    if (!tableResizeObservers.has(dom)) {
      const observer = new ResizeObserver(() => {
        requestTableMeasurement(dom, this.hash, this.tableFrom, view);
      });
      observer.observe(dom);
      tableResizeObservers.set(dom, observer);
    }

    requestTableMeasurement(dom, this.hash, this.tableFrom, view);
    return true;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-table-wrapper";
    wrapper.setAttribute(TABLE_HASH_ATTR, this.hash);
    wrapper.setAttribute(TABLE_FROM_ATTR, String(this.tableFrom));
    wrapper.setAttribute(TABLE_TO_ATTR, String(this.tableTo));

    const table = document.createElement("table");
    table.className = "cm-md-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const [colIndex, cellText] of this.table.headerCells.entries()) {
      const cell = document.createElement("th");
      cell.className = CELL_CLASS;
      cell.setAttribute(TABLE_FROM_ATTR, String(this.tableFrom));
      cell.setAttribute(SECTION_ATTR, "header");
      cell.setAttribute(ROW_ATTR, "0");
      cell.setAttribute(COL_ATTR, String(colIndex));
      const alignment = this.table.alignments[colIndex];
      if (alignment) {
        cell.dataset.align = alignment;
      }
      cell.append(createCellContent(cellText));
      cell.append(createCellMenuTrigger(cell, view));
      headerRow.append(cell);
    }
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement("tbody");
    for (const [rowIndex, row] of this.table.bodyRows.entries()) {
      const rowElement = document.createElement("tr");
      for (const [colIndex, cellText] of row.entries()) {
        const cell = document.createElement("td");
        cell.className = CELL_CLASS;
        cell.setAttribute(TABLE_FROM_ATTR, String(this.tableFrom));
        cell.setAttribute(SECTION_ATTR, "body");
        cell.setAttribute(ROW_ATTR, String(rowIndex));
        cell.setAttribute(COL_ATTR, String(colIndex));
        const alignment = this.table.alignments[colIndex];
        if (alignment) {
          cell.dataset.align = alignment;
        }
        cell.append(createCellContent(cellText));
        cell.append(createCellMenuTrigger(cell, view));
        rowElement.append(cell);
      }
      tbody.append(rowElement);
    }
    table.append(tbody);
    wrapper.append(table);

    wrapper.addEventListener("mousedown", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest(`.${CELL_CLASS}`)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      view.focus();
      const wrapperRect = wrapper.getBoundingClientRect();
      const selectBeforeTable =
        event.clientX <= wrapperRect.left + wrapperRect.width / 2;
      view.dispatch({
        selection: selectBeforeTable
          ? EditorSelection.cursor(this.tableFrom, 1)
          : EditorSelection.cursor(this.tableTo, -1),
      });
    });

    const observer = new ResizeObserver(() => {
      requestTableMeasurement(wrapper, this.hash, this.tableFrom, view);
    });
    observer.observe(wrapper);
    tableResizeObservers.set(wrapper, observer);
    requestTableMeasurement(wrapper, this.hash, this.tableFrom, view);

    return wrapper;
  }
}

function buildTableDecorations(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();

  syntaxTree(state).iterate({
    enter(node: SyntaxNodeRef) {
      if (node.name !== "Table") {
        return;
      }

      const markdown = state.sliceDoc(node.from, node.to);
      const table = parseMarkdownTable(markdown);
      if (!table) {
        return;
      }

      builder.add(
        node.from,
        node.to,
        Decoration.replace({
          block: true,
          widget: new MarkdownTableWidget(table, node.from, node.to),
        }),
      );
    },
  });

  return builder.finish();
}

function transactionTouchesOnlyActiveCell(
  transaction: Transaction,
  resolved: ResolvedActiveTableCell | null,
): boolean {
  if (!resolved || !transaction.docChanged) {
    return false;
  }

  let touchesOnlyCell = true;
  transaction.changes.iterChanges((fromA: number, toA: number) => {
    if (fromA < resolved.editableFrom || toA > resolved.editableTo) {
      touchesOnlyCell = false;
    }
  });
  return touchesOnlyCell;
}

/**
 * Check whether any changed range in a transaction intersects with a
 * Table node in either the old or new syntax tree.
 */
function changesAffectTables(transaction: Transaction): boolean {
  let found = false;

  transaction.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (found) return;

    const oldTree = syntaxTree(transaction.startState);
    const oldDoc = transaction.startState.doc;
    oldTree.iterate({
      from: oldDoc.lineAt(fromA).from,
      to: oldDoc.lineAt(Math.min(toA, oldDoc.length)).to,
      enter(node) {
        if (node.name === "Table") {
          found = true;
          return false;
        }
      },
    });

    if (found) return;

    const newTree = syntaxTree(transaction.state);
    const newDoc = transaction.state.doc;
    newTree.iterate({
      from: newDoc.lineAt(fromB).from,
      to: newDoc.lineAt(Math.min(toB, newDoc.length)).to,
      enter(node) {
        if (node.name === "Table") {
          found = true;
          return false;
        }
      },
    });
  });

  return found;
}

const tableDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return buildTableDecorations(state);
  },
  update(decorations, transaction) {
    if (
      transaction.effects.some((effect) =>
        effect.is(clearActiveTableCellEffect),
      )
    ) {
      return buildTableDecorations(transaction.state);
    }

    if (!transaction.docChanged) {
      if (
        syntaxTree(transaction.state) !== syntaxTree(transaction.startState)
      ) {
        return buildTableDecorations(transaction.state);
      }
      return decorations;
    }

    const resolved = getResolvedActiveTableCell(transaction.startState);
    if (
      transaction.annotation(syncTableEditAnnotation) &&
      transactionTouchesOnlyActiveCell(transaction, resolved)
    ) {
      return decorations.map(transaction.changes);
    }

    // When the change doesn't touch any Table node, map existing
    // decorations through position changes. This avoids rebuilding
    // all table widgets on every keystroke outside of tables.
    if (!changesAffectTables(transaction)) {
      return decorations.map(transaction.changes);
    }

    return buildTableDecorations(transaction.state);
  },
  provide(field) {
    return [EditorView.decorations.from(field)];
  },
});

function createUndoScrollPreservation() {
  let viewRef: EditorView | null = null;

  const captureView = ViewPlugin.fromClass(
    class {
      constructor(private readonly view: EditorView) {
        viewRef = view;
      }

      destroy() {
        if (viewRef === this.view) {
          viewRef = null;
        }
      }
    },
  );

  const preserveScroll = EditorState.transactionExtender.of(
    (transaction: Transaction) => {
      if (!viewRef || !isUndoRedoTransaction(transaction)) {
        return null;
      }

      const selectionInsideTable =
        resolveTableAtPosition(
          transaction.startState.selection.main.head,
          transaction.startState,
        ) !== null;
      if (
        !getActiveTableCell(transaction.startState) &&
        !selectionInsideTable
      ) {
        return null;
      }

      return {
        effects: viewRef.scrollSnapshot(),
      };
    },
  );

  return [captureView, preserveScroll] as const;
}

const activeTableCellGuard = EditorState.transactionExtender.of(
  (transaction: Transaction) => {
    if (
      !transaction.docChanged ||
      transaction.annotation(syncTableEditAnnotation) ||
      transaction.annotation(normalizeBeforeEditAnnotation) ||
      isUndoRedoTransaction(transaction)
    ) {
      return null;
    }

    if (
      transaction.effects.some(
        (effect: StateEffect<unknown>) =>
          effect.is(setActiveTableCellEffect) ||
          effect.is(clearActiveTableCellEffect),
      )
    ) {
      return null;
    }

    return getActiveTableCell(transaction.startState)
      ? { effects: clearActiveTableCellEffect.of() }
      : null;
  },
);

function clampSelectionFocus(
  selection: CellSelection,
  view: EditorView,
  focus: CellCoords,
) {
  const resolvedTable = resolveTableByFrom(view.state, selection.tableFrom);
  if (!resolvedTable) {
    return null;
  }

  const unifiedRow = Math.max(
    0,
    Math.min(resolvedTable.table.bodyRows.length, toUnifiedRow(focus)),
  );
  const col = Math.max(
    0,
    Math.min(resolvedTable.table.headerCells.length - 1, focus.col),
  );

  return fromUnifiedRow(unifiedRow, col);
}

function dispatchCellSelection(
  clearActiveCell: boolean,
  selection: CellSelection,
  view: EditorView,
) {
  const resolvedTable = resolveTableByFrom(view.state, selection.tableFrom);
  if (!resolvedTable) {
    return false;
  }

  const focusRange =
    selection.focus.section === "header"
      ? resolvedTable.table.cellRanges.headers[selection.focus.col]
      : resolvedTable.table.cellRanges.rows[selection.focus.row]?.[
          selection.focus.col
        ];
  if (!focusRange) {
    return false;
  }

  view.dispatch({
    selection: EditorSelection.single(
      resolvedTable.tableFrom + focusRange.editableFrom,
    ),
    effects: [
      setCellSelectionEffect.of({
        anchor: normalizeCellCoords(selection.anchor),
        focus: normalizeCellCoords(selection.focus),
        tableFrom: selection.tableFrom,
      }),
      ...(clearActiveCell ? [clearActiveTableCellEffect.of()] : []),
    ],
    annotations: cellSelectionTransitionAnnotation.of(true),
    scrollIntoView: false,
  });
  return true;
}

function extendExistingCellSelection(
  direction: CellSelectionDirection,
  view: EditorView,
) {
  const selection = getCellSelection(view.state);
  if (!selection) {
    return false;
  }

  const focus = clampSelectionFocus(
    selection,
    view,
    moveCellCoords(selection.focus, direction),
  );
  if (!focus) {
    return false;
  }

  return dispatchCellSelection(
    false,
    {
      anchor: selection.anchor,
      focus,
      tableFrom: selection.tableFrom,
    },
    view,
  );
}

function startCellSelectionFromActiveCell(
  direction: CellSelectionDirection,
  view: EditorView,
) {
  const activeCell = getActiveTableCell(view.state);
  if (!activeCell) {
    return false;
  }

  const selection: CellSelection = {
    anchor: activeCellToCoords(activeCell),
    focus: activeCellToCoords(activeCell),
    tableFrom: activeCell.tableFrom,
  };
  const focus = clampSelectionFocus(
    selection,
    view,
    moveCellCoords(selection.focus, direction),
  );
  if (!focus) {
    return false;
  }

  return dispatchCellSelection(
    true,
    {
      anchor: selection.anchor,
      focus,
      tableFrom: selection.tableFrom,
    },
    view,
  );
}

function setOrExtendCellSelectionToCoords(
  focus: CellCoords,
  tableFrom: number,
  view: EditorView,
) {
  const selection = getCellSelection(view.state);
  if (selection && selection.tableFrom === tableFrom) {
    const clampedFocus = clampSelectionFocus(selection, view, focus);
    if (!clampedFocus) {
      return false;
    }

    return dispatchCellSelection(
      false,
      {
        anchor: selection.anchor,
        focus: clampedFocus,
        tableFrom,
      },
      view,
    );
  }

  const activeCell = getActiveTableCell(view.state);
  if (activeCell && activeCell.tableFrom === tableFrom) {
    const nextSelection: CellSelection = {
      anchor: activeCellToCoords(activeCell),
      focus: activeCellToCoords(activeCell),
      tableFrom,
    };
    const clampedFocus = clampSelectionFocus(nextSelection, view, focus);
    if (!clampedFocus) {
      return false;
    }

    return dispatchCellSelection(
      true,
      {
        anchor: nextSelection.anchor,
        focus: clampedFocus,
        tableFrom,
      },
      view,
    );
  }

  return dispatchCellSelection(
    false,
    {
      anchor: focus,
      focus,
      tableFrom,
    },
    view,
  );
}

function findActiveCellElement(
  view: EditorView,
  activeCell: ActiveTableCell,
): HTMLElement | null {
  const selector = [
    `.${CELL_CLASS}[${TABLE_FROM_ATTR}="${activeCell.tableFrom}"]`,
    `[${SECTION_ATTR}="${activeCell.section}"]`,
    `[${ROW_ATTR}="${activeCell.section === "header" ? 0 : activeCell.row}"]`,
    `[${COL_ATTR}="${activeCell.col}"]`,
  ].join("");
  const element = view.dom.querySelector(selector);
  return element instanceof HTMLElement ? element : null;
}

function rememberPendingTableCellOpen(
  view: EditorView,
  activeCell: ActiveTableCell,
  cursorPos: PendingCursorPosition,
  localSelection?: {
    anchor: number;
    head: number;
  },
) {
  pendingTableCellOpens.set(view, {
    activeCell,
    cursorPos,
    localSelection,
  });
}

function consumePendingTableCellOpen(
  view: EditorView,
  activeCell: ActiveTableCell,
): PendingTableCellOpen | null {
  const pending = pendingTableCellOpens.get(view);
  if (!pending) {
    return null;
  }

  if (!isSameActiveTableCell(pending.activeCell, activeCell)) {
    return null;
  }

  pendingTableCellOpens.delete(view);
  return pending;
}

function peekPendingTableCellOpen(
  view: EditorView,
  activeCell: ActiveTableCell,
): PendingTableCellOpen | null {
  const pending = pendingTableCellOpens.get(view);
  if (!pending || !isSameActiveTableCell(pending.activeCell, activeCell)) {
    return null;
  }

  return pending;
}

function moveTableSelection(
  view: EditorView,
  direction: "down" | "next" | "previous" | "up",
  cursorPos: PendingCursorPosition,
) {
  const activeCell = getActiveTableCell(view.state);
  const resolved = getResolvedActiveTableCell(view.state);
  if (!activeCell || !resolved) {
    return false;
  }

  const rowCount = 1 + resolved.table.bodyRows.length;
  const columnCount = resolved.table.headerCells.length;
  if (columnCount === 0) {
    return false;
  }

  let unifiedRow = activeCell.section === "header" ? 0 : activeCell.row + 1;
  let unifiedCol = activeCell.col;

  switch (direction) {
    case "next": {
      unifiedCol += 1;
      if (unifiedCol >= columnCount) {
        unifiedCol = 0;
        unifiedRow += 1;
      }
      break;
    }
    case "previous": {
      unifiedCol -= 1;
      if (unifiedCol < 0) {
        unifiedCol = columnCount - 1;
        unifiedRow -= 1;
      }
      break;
    }
    case "down": {
      unifiedRow += 1;
      break;
    }
    case "up": {
      unifiedRow -= 1;
      break;
    }
  }

  if (unifiedRow < 0) {
    return true;
  }

  if (unifiedRow >= rowCount) {
    return insertRowFromNavigation(activeCell, cursorPos, direction, view);
  }

  const nextActiveCell: ActiveTableCell =
    unifiedRow === 0
      ? {
          col: unifiedCol,
          row: 0,
          section: "header",
          tableFrom: resolved.tableFrom,
        }
      : {
          col: unifiedCol,
          row: unifiedRow - 1,
          section: "body",
          tableFrom: resolved.tableFrom,
        };

  rememberPendingTableCellOpen(view, nextActiveCell, cursorPos);
  dispatchActiveTableCellSelection(nextActiveCell, view);
  return true;
}

function clampActiveTableCellTarget(
  target: Pick<ActiveTableCell, "col" | "row" | "section">,
  table: MarkdownTable,
  tableFrom: number,
): ActiveTableCell {
  const safeCol =
    table.columnCount > 0
      ? Math.max(0, Math.min(target.col, table.columnCount - 1))
      : 0;

  if (target.section === "header" || table.bodyRows.length === 0) {
    return {
      col: safeCol,
      row: 0,
      section: "header",
      tableFrom,
    };
  }

  return {
    col: safeCol,
    row: Math.max(0, Math.min(target.row, table.bodyRows.length - 1)),
    section: "body",
    tableFrom,
  };
}

function runTableOperation(
  activeCell: ActiveTableCell,
  computeTargetCell: (cell: ActiveTableCell) => TableOperationTarget,
  cursorPos: PendingCursorPosition,
  operation: (table: MarkdownTable, cell: ActiveTableCell) => MarkdownTable,
  preserveSelection: boolean,
  view: EditorView,
) {
  return runTableOperationAtCell(
    activeCell,
    computeTargetCell,
    cursorPos,
    operation,
    preserveSelection,
    view,
  );
}

function runTableHistoryCommand(
  command: (target: EditorView) => boolean,
  view: EditorView,
) {
  command(view);
  return true;
}

function scheduleMainEditorAction(action: () => void) {
  requestAnimationFrame(() => {
    action();
  });
  return true;
}

function syncMainSelectionToLocalSelection(
  localSelection: { anchor: number; head: number },
  localText: string,
  mainView: EditorView,
  resolved: ResolvedActiveTableCell,
) {
  const rootSelection = toRootSelection(localSelection, localText);
  const absoluteSelection = EditorSelection.single(
    resolved.editableFrom + rootSelection.anchor,
    resolved.editableFrom + rootSelection.head,
  );
  const currentSelection = mainView.state.selection.main;
  if (
    currentSelection.anchor === absoluteSelection.main.anchor &&
    currentSelection.head === absoluteSelection.main.head
  ) {
    return;
  }

  mainView.dispatch({
    selection: absoluteSelection,
    annotations: [
      syncTableEditAnnotation.of(true),
      Transaction.addToHistory.of(false),
    ],
    scrollIntoView: false,
  });
}

function scheduleMainSelectionToLocalSelection(
  localSelection: { anchor: number; head: number },
  localText: string,
  mainView: EditorView,
  resolved: ResolvedActiveTableCell,
) {
  requestAnimationFrame(() => {
    if (!mainView.dom.isConnected) {
      return;
    }

    syncMainSelectionToLocalSelection(
      localSelection,
      localText,
      mainView,
      resolved,
    );
  });
}

function insertRowFromNavigation(
  activeCell: ActiveTableCell,
  cursorPos: PendingCursorPosition,
  direction: "down" | "next" | "previous" | "up",
  view: EditorView,
) {
  if (direction !== "down" && direction !== "next") {
    return false;
  }

  const targetCol = direction === "next" ? 0 : activeCell.col;
  const targetRow = activeCell.section === "header" ? 0 : activeCell.row + 1;

  return runTableOperation(
    activeCell,
    () => ({
      col: targetCol,
      row: targetRow,
      section: "body",
    }),
    cursorPos,
    (table, cell) => table.insertRowRelativeTo(cell.section, cell.row, "after"),
    false,
    view,
  );
}

const nestedTableEditorTheme = EditorView.theme({
  "&": {
    background: "transparent",
    font: "inherit",
    minHeight: "1.5rem",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    caretColor: "var(--editor-caret)",
    font: "inherit",
    minHeight: "1.5rem",
    padding: "0",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-scroller": {
    font: "inherit",
    overflow: "visible",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor:
      "color-mix(in oklab, var(--primary) 22%, transparent) !important",
  },
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--editor-caret)",
    borderLeftWidth: "1.5px",
  },
  ".cm-selectionLayer": {
    zIndex: "1 !important",
    pointerEvents: "none",
  },
  ".cm-cursorLayer": {
    zIndex: "2 !important",
  },
  "&.cm-editor.cm-focused .cm-content::selection, &.cm-editor.cm-focused .cm-content *::selection":
    {
      backgroundColor: "transparent !important",
      color: "inherit !important",
    },
  "&.cm-editor .cm-content::selection, &.cm-editor .cm-content *::selection": {
    backgroundColor: "transparent !important",
    color: "inherit !important",
  },
});

class NestedTableEditorController {
  private applyingRootUpdate = false;
  private cellElement: HTMLElement | null = null;
  private editor: EditorView | null = null;
  private mainView: EditorView | null = null;
  private resolved: ResolvedActiveTableCell | null = null;

  open(
    mainView: EditorView,
    resolved: ResolvedActiveTableCell,
    cellElement: HTMLElement,
    pendingOpen: PendingTableCellOpen | null = null,
  ) {
    this.close();

    this.mainView = mainView;
    this.resolved = resolved;
    this.cellElement = cellElement;
    this.cellElement.classList.add("cm-md-table-cell-active");

    const host = document.createElement("div");
    host.className = ACTIVE_CELL_HOST_CLASS;
    this.cellElement.replaceChildren(host);

    const localText = unsanitizeRootText(resolved.text);
    const initialCursorPos = pendingOpen?.cursorPos ?? "end";
    let initialSelection = {
      anchor: localText.length,
      head: localText.length,
    };
    switch (initialCursorPos) {
      case "start": {
        initialSelection = { anchor: 0, head: 0 };
        break;
      }
      case "lastLineStart": {
        const lineStart = localText.includes("\n")
          ? localText.lastIndexOf("\n") + 1
          : 0;
        initialSelection = { anchor: lineStart, head: lineStart };
        break;
      }
      case "mapped": {
        initialSelection = clampSelection(
          pendingOpen?.localSelection ??
            toLocalSelection(
              clampSelection(
                {
                  anchor:
                    mainView.state.selection.main.anchor -
                    resolved.editableFrom,
                  head:
                    mainView.state.selection.main.head - resolved.editableFrom,
                },
                resolved.text.length,
              ),
              resolved.text,
            ),
          localText.length,
        );
        break;
      }
      default: {
        break;
      }
    }
    const state = EditorState.create({
      doc: localText,
      selection: EditorSelection.single(
        initialSelection.anchor,
        initialSelection.head,
      ),
      extensions: [
        drawSelection(),
        EditorView.lineWrapping,
        nestedTableEditorTheme,
        keymap.of([
          {
            key: "ArrowDown",
            run: (nestedView) => {
              const { head, to } = nestedView.state.selection.main;
              const headRect = nestedView.coordsAtPos(head);
              const toRect = nestedView.coordsAtPos(to);
              if (
                head === to ||
                (headRect && toRect && Math.abs(headRect.top - toRect.top) < 2)
              ) {
                return moveTableSelection(mainView, "down", "start");
              }
              return false;
            },
          },
          {
            key: "Shift-ArrowDown",
            run: (nestedView) => {
              const { head, to } = nestedView.state.selection.main;
              const headRect = nestedView.coordsAtPos(head);
              const toRect = nestedView.coordsAtPos(to);
              return head === to ||
                (headRect && toRect && Math.abs(headRect.top - toRect.top) < 2)
                ? (this.close(),
                  scheduleMainEditorAction(() => {
                    startCellSelectionFromActiveCell("down", mainView);
                  }))
                : false;
            },
          },
          {
            key: "ArrowLeft",
            run: (nestedView) => {
              const { from, head } = nestedView.state.selection.main;
              return head === from
                ? moveTableSelection(mainView, "previous", "end")
                : false;
            },
          },
          {
            key: "Shift-ArrowLeft",
            run: (nestedView) => {
              const { from, head } = nestedView.state.selection.main;
              return head === from
                ? (this.close(),
                  scheduleMainEditorAction(() => {
                    startCellSelectionFromActiveCell("left", mainView);
                  }))
                : false;
            },
          },
          {
            key: "ArrowRight",
            run: (nestedView) => {
              const { head, to } = nestedView.state.selection.main;
              return head === to
                ? moveTableSelection(mainView, "next", "start")
                : false;
            },
          },
          {
            key: "Shift-ArrowRight",
            run: (nestedView) => {
              const { head, to } = nestedView.state.selection.main;
              return head === to
                ? (this.close(),
                  scheduleMainEditorAction(() => {
                    startCellSelectionFromActiveCell("right", mainView);
                  }))
                : false;
            },
          },
          {
            key: "ArrowUp",
            run: (nestedView) => {
              const { from, head } = nestedView.state.selection.main;
              const headRect = nestedView.coordsAtPos(head);
              const fromRect = nestedView.coordsAtPos(from);
              if (
                head === from ||
                (headRect &&
                  fromRect &&
                  Math.abs(headRect.top - fromRect.top) < 2)
              ) {
                return moveTableSelection(mainView, "up", "lastLineStart");
              }
              return false;
            },
          },
          {
            key: "Shift-ArrowUp",
            run: (nestedView) => {
              const { from, head } = nestedView.state.selection.main;
              const headRect = nestedView.coordsAtPos(head);
              const fromRect = nestedView.coordsAtPos(from);
              return head === from ||
                (headRect &&
                  fromRect &&
                  Math.abs(headRect.top - fromRect.top) < 2)
                ? (this.close(),
                  scheduleMainEditorAction(() => {
                    startCellSelectionFromActiveCell("up", mainView);
                  }))
                : false;
            },
          },
          {
            key: "Escape",
            run: () => {
              if (!this.mainView) {
                return false;
              }
              this.mainView.dispatch({
                effects: clearActiveTableCellEffect.of(),
              });
              this.mainView.focus();
              return true;
            },
          },
          {
            key: "Mod-Alt-ArrowDown",
            run: () =>
              this.mainView && this.resolved
                ? runTableOperation(
                    this.resolved.activeCell,
                    (cell) => ({
                      col: cell.col,
                      row: cell.section === "header" ? 0 : cell.row + 1,
                      section: "body",
                    }),
                    "start",
                    (table, cell) =>
                      table.insertRowRelativeTo(
                        cell.section,
                        cell.row,
                        "after",
                      ),
                    false,
                    this.mainView,
                  )
                : false,
          },
          {
            key: "Mod-Alt-ArrowLeft",
            run: () =>
              this.mainView && this.resolved
                ? runTableOperation(
                    this.resolved.activeCell,
                    (cell) => ({
                      col: cell.col + 1,
                      row: cell.row,
                      section: cell.section,
                    }),
                    "mapped",
                    (table, cell) => table.insertColumn(cell.col, "before"),
                    true,
                    this.mainView,
                  )
                : false,
          },
          {
            key: "Mod-Alt-ArrowRight",
            run: () =>
              this.mainView && this.resolved
                ? runTableOperation(
                    this.resolved.activeCell,
                    (cell) => ({
                      col: cell.col,
                      row: cell.row,
                      section: cell.section,
                    }),
                    "mapped",
                    (table, cell) => table.insertColumn(cell.col, "after"),
                    true,
                    this.mainView,
                  )
                : false,
          },
          {
            key: "Mod-Alt-ArrowUp",
            run: () =>
              this.mainView && this.resolved
                ? runTableOperation(
                    this.resolved.activeCell,
                    (cell) => ({
                      col: cell.col,
                      row: cell.section === "header" ? 0 : cell.row,
                      section: cell.section === "header" ? "header" : "body",
                    }),
                    "start",
                    (table, cell) =>
                      table.insertRowRelativeTo(
                        cell.section,
                        cell.row,
                        "before",
                      ),
                    false,
                    this.mainView,
                  )
                : false,
          },
          {
            key: "Enter",
            run: () => moveTableSelection(mainView, "down", "start"),
          },
          {
            key: "Mod-y",
            run: () => runTableHistoryCommand(redo, mainView),
          },
          {
            key: "Mod-Alt-Backspace",
            run: () =>
              this.mainView && this.resolved
                ? runTableOperation(
                    this.resolved.activeCell,
                    (cell) => ({
                      col: cell.col,
                      row:
                        cell.section === "header"
                          ? 0
                          : Math.max(0, cell.row - 1),
                      section: cell.section === "header" ? "header" : "body",
                    }),
                    "start",
                    (table, cell) => table.deleteRowAt(cell.section, cell.row),
                    false,
                    this.mainView,
                  )
                : false,
          },
          {
            key: "Mod-Alt-Delete",
            run: () =>
              this.mainView && this.resolved
                ? runTableOperation(
                    this.resolved.activeCell,
                    (cell) => ({
                      col: Math.max(0, cell.col - 1),
                      row: cell.row,
                      section: cell.section,
                    }),
                    "start",
                    (table, cell) => table.deleteColumn(cell.col),
                    false,
                    this.mainView,
                  )
                : false,
          },
          {
            key: "Shift-Enter",
            run: (nestedView) => {
              const { from, to } = nestedView.state.selection.main;
              nestedView.dispatch({
                changes: { from, insert: "\n", to },
                selection: EditorSelection.cursor(from + 1),
              });
              return true;
            },
          },
          {
            key: "Mod-Shift-z",
            run: () => runTableHistoryCommand(redo, mainView),
          },
          {
            key: "Shift-Tab",
            run: () => moveTableSelection(mainView, "previous", "end"),
          },
          {
            key: "Tab",
            run: () => moveTableSelection(mainView, "next", "start"),
          },
          {
            key: "Mod-z",
            run: () => runTableHistoryCommand(undo, mainView),
          },
        ]),
        EditorView.domEventHandlers({
          beforeinput(event) {
            event.stopPropagation();
            return false;
          },
          compositionend(event) {
            event.stopPropagation();
            return false;
          },
          compositionstart(event) {
            event.stopPropagation();
            return false;
          },
          compositionupdate(event) {
            event.stopPropagation();
            return false;
          },
          input(event) {
            event.stopPropagation();
            return false;
          },
          keydown(event) {
            event.stopPropagation();
            return false;
          },
        }),
        EditorView.updateListener.of((update) =>
          this.handleLocalUpdate(update),
        ),
      ],
    });

    this.editor = new EditorView({
      parent: host,
      state,
    });
    let openedSelection = initialSelection;

    if (pendingOpen?.clickCoords) {
      const pos = this.editor.posAtCoords(pendingOpen.clickCoords);
      if (pos != null) {
        openedSelection = { anchor: pos, head: pos };
        this.editor.dispatch({
          selection: EditorSelection.cursor(pos),
          scrollIntoView: false,
        });
      }
    }

    scheduleMainSelectionToLocalSelection(
      openedSelection,
      localText,
      mainView,
      resolved,
    );
    this.editor.contentDOM.focus({ preventScroll: true });
  }

  handleMainEditorUpdate(mainView: EditorView) {
    if (!this.editor || !this.resolved) {
      return;
    }

    const activeCell = getActiveTableCell(mainView.state);
    if (!activeCell) {
      this.close();
      return;
    }

    const resolved = getResolvedActiveTableCell(mainView.state);
    if (!resolved) {
      this.close();
      requestAnimationFrame(() => {
        mainView.dispatch({ effects: clearActiveTableCellEffect.of() });
      });
      return;
    }

    this.mainView = mainView;
    this.resolved = resolved;

    const nextCellElement = findActiveCellElement(
      mainView,
      resolved.activeCell,
    );
    if (!nextCellElement) {
      return;
    }

    if (
      this.cellElement !== nextCellElement ||
      !this.cellElement?.isConnected
    ) {
      this.open(mainView, resolved, nextCellElement);
      return;
    }

    const localText = unsanitizeRootText(resolved.text);
    const relativeRootSelection = clampSelection(
      {
        anchor: mainView.state.selection.main.anchor - resolved.editableFrom,
        head: mainView.state.selection.main.head - resolved.editableFrom,
      },
      resolved.text.length,
    );
    const rootMappedSelection = clampSelection(
      toLocalSelection(relativeRootSelection, resolved.text),
      localText.length,
    );
    if (
      localText === this.editor.state.doc.toString() &&
      this.editor.state.selection.main.anchor === rootMappedSelection.anchor &&
      this.editor.state.selection.main.head === rootMappedSelection.head
    ) {
      return;
    }

    this.applyingRootUpdate = true;
    const nextSelection = clampSelection(
      {
        anchor: rootMappedSelection.anchor,
        head: rootMappedSelection.head,
      },
      localText.length,
    );
    this.editor.dispatch({
      changes: {
        from: 0,
        insert: localText,
        to: this.editor.state.doc.length,
      },
      selection: EditorSelection.create([
        EditorSelection.range(nextSelection.anchor, nextSelection.head),
      ]),
    });
    this.applyingRootUpdate = false;
  }

  private handleLocalUpdate(update: ViewUpdate) {
    if (this.applyingRootUpdate || !this.mainView || !this.resolved) {
      return;
    }

    if (!update.docChanged && !update.selectionSet) {
      return;
    }

    const localText = update.state.doc.toString();
    const rootText = sanitizeLocalText(localText);
    const rootSelection = toRootSelection(
      {
        anchor: update.state.selection.main.anchor,
        head: update.state.selection.main.head,
      },
      localText,
    );
    const absoluteSelection = {
      anchor: this.resolved.editableFrom + rootSelection.anchor,
      head: this.resolved.editableFrom + rootSelection.head,
    };
    const currentMainSelection = this.mainView.state.selection.main;
    const selectionChanged =
      currentMainSelection.anchor !== absoluteSelection.anchor ||
      currentMainSelection.head !== absoluteSelection.head;
    const textChanged = rootText !== this.resolved.text;

    if (!textChanged && !selectionChanged) {
      return;
    }

    this.mainView.dispatch({
      changes: textChanged
        ? {
            from: this.resolved.editableFrom,
            insert: rootText,
            to: this.resolved.editableTo,
          }
        : undefined,
      selection: EditorSelection.single(
        absoluteSelection.anchor,
        absoluteSelection.head,
      ),
      annotations: textChanged
        ? syncTableEditAnnotation.of(true)
        : [
            syncTableEditAnnotation.of(true),
            Transaction.addToHistory.of(false),
          ],
      scrollIntoView: false,
    });
  }

  close() {
    const localText = this.editor?.state.doc.toString();
    if (this.cellElement) {
      this.cellElement.classList.remove("cm-md-table-cell-active");
      const restoredContent = createCellContentFromLocalText(
        localText ?? unsanitizeRootText(this.resolved?.text ?? ""),
      );
      const restoredChildren = [restoredContent];
      if (this.mainView) {
        restoredChildren.push(
          createCellMenuTrigger(this.cellElement, this.mainView),
        );
      }
      this.cellElement.replaceChildren(...restoredChildren);
    }
    this.editor?.destroy();
    this.editor = null;
    this.cellElement = null;
    this.resolved = null;
  }

  isOpenFor(activeCell: ActiveTableCell, cellElement: HTMLElement): boolean {
    return (
      isSameActiveTableCell(this.resolved?.activeCell ?? null, activeCell) &&
      this.cellElement === cellElement &&
      this.editor !== null
    );
  }

  focus() {
    if (this.editor) {
      this.editor.contentDOM.focus({ preventScroll: true });
      return true;
    }

    return false;
  }

  hasFocus() {
    return (
      this.editor !== null && this.editor.dom.contains(document.activeElement)
    );
  }

  syncSelectionToMain() {
    if (!this.editor || !this.mainView || !this.resolved) {
      return false;
    }

    const localText = this.editor.state.doc.toString();
    syncMainSelectionToLocalSelection(
      {
        anchor: this.editor.state.selection.main.anchor,
        head: this.editor.state.selection.main.head,
      },
      localText,
      this.mainView,
      this.resolved,
    );
    return true;
  }
}

const nestedEditors = new WeakMap<EditorView, NestedTableEditorController>();

function normalizeTableBeforeOpen(
  activeCell: ActiveTableCell,
  resolved: ResolvedActiveTableCell,
  view: EditorView,
) {
  if (pendingTableNormalizations.has(view)) {
    return true;
  }

  const canonicalText = getCanonicalTableTextIfChanged(
    resolved.table,
    view.state.sliceDoc(resolved.tableFrom, resolved.tableTo),
  );
  if (!canonicalText) {
    return false;
  }
  const pendingOpen = peekPendingTableCellOpen(view, activeCell);

  rememberPendingTableCellOpen(
    view,
    {
      ...activeCell,
      tableFrom: resolved.tableFrom,
    },
    pendingOpen?.cursorPos ?? "end",
    pendingOpen?.localSelection,
  );

  pendingTableNormalizations.add(view);
  requestAnimationFrame(() => {
    pendingTableNormalizations.delete(view);
    if (!view.dom.isConnected) {
      return;
    }

    const nextTable = parseMarkdownTable(canonicalText);
    const nextActiveCell = {
      ...activeCell,
      tableFrom: resolved.tableFrom,
    };
    const selection = nextTable
      ? selectionForActiveTableCell(
          nextActiveCell,
          nextTable,
          resolved.tableFrom,
        )
      : null;

    view.dispatch({
      changes: {
        from: resolved.tableFrom,
        insert: canonicalText,
        to: resolved.tableTo,
      },
      effects: setActiveTableCellEffect.of(nextActiveCell),
      selection: selection ?? undefined,
      annotations: normalizeBeforeEditAnnotation.of(true),
      scrollIntoView: false,
    });
  });
  return true;
}

function findTableWidgetElement(view: EditorView, tableFrom: number) {
  const selector = `.${CELL_CLASS}[${TABLE_FROM_ATTR}="${tableFrom}"]`;
  return (
    view.dom.querySelector(selector)?.closest(".cm-md-table-wrapper") ?? null
  );
}

function readCellCoords(cell: Element): CellCoords | null {
  const section = cell.getAttribute(SECTION_ATTR);
  const row = Number(cell.getAttribute(ROW_ATTR));
  const col = Number(cell.getAttribute(COL_ATTR));
  if (
    (section !== "header" && section !== "body") ||
    Number.isNaN(row) ||
    Number.isNaN(col)
  ) {
    return null;
  }

  return { col, row, section };
}

const cellSelectionVisualsPlugin = ViewPlugin.fromClass(
  class {
    private readonly selectedCells = new Set<HTMLElement>();

    constructor(private readonly view: EditorView) {
      this.scheduleSync();
    }

    destroy() {
      this.clear();
    }

    update() {
      this.scheduleSync();
    }

    private clear() {
      for (const cell of this.selectedCells) {
        cell.classList.remove("cm-md-table-cell-selected");
      }
      this.selectedCells.clear();
    }

    private scheduleSync() {
      this.view.requestMeasure({
        key: this,
        read: () => {
          const selection = getCellSelection(this.view.state);
          if (!selection) {
            return [];
          }

          const widget = findTableWidgetElement(this.view, selection.tableFrom);
          if (!(widget instanceof HTMLElement)) {
            return [];
          }

          const rect = toSelectionRect(selection);
          const cells = widget.querySelectorAll(`.${CELL_CLASS}`);
          const selected: HTMLElement[] = [];

          for (const cell of cells) {
            const coords = readCellCoords(cell);
            if (
              coords &&
              isCellInRect(rect, coords) &&
              cell instanceof HTMLElement
            ) {
              selected.push(cell);
            }
          }

          return selected;
        },
        write: (selected: HTMLElement[]) => {
          this.clear();
          for (const cell of selected) {
            cell.classList.add("cm-md-table-cell-selected");
            this.selectedCells.add(cell);
          }
        },
      });
    }
  },
);

const nestedTableEditorPlugin = ViewPlugin.fromClass(
  class {
    private readonly controller: NestedTableEditorController;

    constructor(private readonly view: EditorView) {
      this.controller = new NestedTableEditorController();
      nestedEditors.set(view, this.controller);
      this.sync();
    }

    update(update: ViewUpdate) {
      const resolvedPreviousActiveCell = getResolvedActiveTableCell(
        update.startState,
      );
      const shouldRepositionAfterUndoRedo =
        update.docChanged &&
        update.transactions.some((transaction) =>
          transactionRequiresTableRebuild(
            transaction,
            resolvedPreviousActiveCell,
          ),
        );
      if (shouldRepositionAfterUndoRedo) {
        const scrollContainer = findEditorScrollContainer(this.view);
        const scrollTop = scrollContainer?.scrollTop ?? 0;
        this.controller.close();
        requestAnimationFrame(() => {
          if (!this.view.dom.isConnected) {
            return;
          }

          activateCellAtPosition(
            true,
            this.view.state.selection.main.head,
            this.view,
          );
          if (scrollContainer) {
            lockEditorScrollPosition(scrollContainer, scrollTop);
          }
        });
        return;
      }

      if (
        update.docChanged ||
        update.transactions.some((transaction) =>
          transaction.effects.some(
            (effect) =>
              effect.is(setActiveTableCellEffect) ||
              effect.is(clearActiveTableCellEffect),
          ),
        )
      ) {
        this.sync({
          deferOpen: !update.transactions.some((transaction) =>
            transaction.annotation(normalizeBeforeEditAnnotation),
          ),
        });
      }
    }

    destroy() {
      this.controller.close();
      nestedEditors.delete(this.view);
      destroyTableCellMenu(this.view);
    }

    private sync({ deferOpen = true }: { deferOpen?: boolean } = {}) {
      const activeCell = getActiveTableCell(this.view.state);
      if (!activeCell) {
        this.controller.close();
        return;
      }

      const resolved = getResolvedActiveTableCell(this.view.state);
      if (!resolved) {
        this.controller.close();
        requestAnimationFrame(() => {
          if (this.view.dom.isConnected) {
            this.view.dispatch({
              effects: clearActiveTableCellEffect.of(),
            });
          }
        });
        return;
      }

      if (normalizeTableBeforeOpen(activeCell, resolved, this.view)) {
        return;
      }

      const cellElement = findActiveCellElement(this.view, resolved.activeCell);
      if (!cellElement) {
        requestAnimationFrame(() => {
          if (!this.view.dom.isConnected) {
            return;
          }
          const nextElement = findActiveCellElement(
            this.view,
            resolved.activeCell,
          );
          if (nextElement) {
            this.controller.open(
              this.view,
              resolved,
              nextElement,
              consumePendingTableCellOpen(this.view, resolved.activeCell),
            );
          }
        });
        return;
      }

      if (this.controller.isOpenFor(resolved.activeCell, cellElement)) {
        this.controller.handleMainEditorUpdate(this.view);
        return;
      }

      // Defer open to rAF so the cell widget is laid out before
      // drawSelection()'s initial measure runs. Without this, WebKit's
      // coordsAtPos returns null on the first frame, producing an empty
      // cursor layer that gets display:none.
      const pendingOpen = consumePendingTableCellOpen(
        this.view,
        resolved.activeCell,
      );
      const openIfStillActive = () => {
        if (!this.view.dom.isConnected) {
          return;
        }
        const latestActiveCell = getActiveTableCell(this.view.state);
        if (
          !latestActiveCell ||
          !isSameActiveTableCell(latestActiveCell, resolved.activeCell)
        ) {
          return;
        }
        const latestResolved = getResolvedActiveTableCell(this.view.state);
        if (
          !latestResolved ||
          !isSameActiveTableCell(latestResolved.activeCell, resolved.activeCell)
        ) {
          return;
        }
        const latestCellElement = findActiveCellElement(
          this.view,
          latestResolved.activeCell,
        );
        if (!latestCellElement) {
          return;
        }
        this.controller.open(
          this.view,
          latestResolved,
          latestCellElement,
          pendingOpen,
        );
      };

      if (!deferOpen) {
        openIfStillActive();
        return;
      }

      requestAnimationFrame(openIfStillActive);
    }
  },
);

const cellSelectionClipboardHandlers = EditorView.domEventHandlers({
  copy(event, view) {
    const selection = getCellSelection(view.state);
    if (!selection) {
      return false;
    }

    const text = copyCellSelection(selection, view);
    if (!text || !event.clipboardData) {
      return false;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
    return true;
  },
  cut(event, view) {
    const selection = getCellSelection(view.state);
    if (!selection) {
      return false;
    }

    const text = copyCellSelection(selection, view);
    if (!text || !event.clipboardData) {
      return false;
    }

    event.preventDefault();
    event.clipboardData.setData("text/plain", text);
    return clearSelectedCells(selection, view);
  },
  paste(event, view) {
    const selection = getCellSelection(view.state);
    const clipboardText = event.clipboardData?.getData("text/plain");
    if (!selection || !clipboardText) {
      return false;
    }

    event.preventDefault();
    return pasteIntoCellSelection(clipboardText, selection, view);
  },
});

const cellSelectionKeymap = keymap.of([
  {
    key: "Backspace",
    run: (view) => {
      const selection = getCellSelection(view.state);
      return selection ? clearSelectedCells(selection, view) : false;
    },
  },
  {
    key: "Delete",
    run: (view) => {
      const selection = getCellSelection(view.state);
      return selection ? clearSelectedCells(selection, view) : false;
    },
  },
  {
    key: "Escape",
    run: (view) => {
      const selection = getCellSelection(view.state);
      if (!selection) {
        return false;
      }

      view.dispatch({ effects: clearCellSelectionEffect.of() });
      return true;
    },
  },
  {
    key: "Shift-ArrowDown",
    run: (view) => extendExistingCellSelection("down", view),
  },
  {
    key: "Shift-ArrowLeft",
    run: (view) => extendExistingCellSelection("left", view),
  },
  {
    key: "Shift-ArrowRight",
    run: (view) => extendExistingCellSelection("right", view),
  },
  {
    key: "Shift-ArrowUp",
    run: (view) => extendExistingCellSelection("up", view),
  },
]);

function getCellElementFromEventTarget(
  target: EventTarget | null,
): HTMLElement | null {
  return target instanceof HTMLElement
    ? target.closest(`.${CELL_CLASS}`)
    : null;
}

function getCellTargetData(cellElement: HTMLElement): ActiveTableCell | null {
  const tableFrom = Number.parseInt(
    cellElement.getAttribute(TABLE_FROM_ATTR) ?? "",
    10,
  );
  const sectionAttribute = cellElement.getAttribute(SECTION_ATTR);
  const row = Number.parseInt(cellElement.getAttribute(ROW_ATTR) ?? "0", 10);
  const col = Number.parseInt(cellElement.getAttribute(COL_ATTR) ?? "0", 10);
  const section =
    sectionAttribute === "header" || sectionAttribute === "body"
      ? sectionAttribute
      : null;

  if (!Number.isFinite(tableFrom) || section === null) {
    return null;
  }

  return {
    col,
    row,
    section,
    tableFrom,
  };
}

function clearTableInteractionState(
  target: EventTarget | null,
  view: EditorView,
) {
  const clickedInsideTable =
    target instanceof HTMLElement && target.closest(".cm-md-table-wrapper");

  if (clickedInsideTable) {
    return false;
  }

  if (getActiveTableCell(view.state)) {
    view.dispatch({
      effects: clearActiveTableCellEffect.of(),
    });
    return false;
  }

  if (getCellSelection(view.state)) {
    view.dispatch({
      effects: clearCellSelectionEffect.of(),
    });
  }
}

type TableSelectionPointerState = {
  tableFrom: number;
};

const tableSelectionPointers = new WeakMap<
  EditorView,
  { start: (tableFrom: number) => void }
>();

const tableSelectionPointerPlugin = ViewPlugin.fromClass(
  class {
    private pointerState: TableSelectionPointerState | null = null;

    constructor(private readonly view: EditorView) {
      tableSelectionPointers.set(view, this);
      const ownerDocument = this.view.dom.ownerDocument;
      ownerDocument.addEventListener("mousemove", this.handleMouseMove, true);
      ownerDocument.addEventListener("mouseup", this.handleMouseUp, true);
    }

    destroy() {
      tableSelectionPointers.delete(this.view);
      const ownerDocument = this.view.dom.ownerDocument;
      ownerDocument.removeEventListener(
        "mousemove",
        this.handleMouseMove,
        true,
      );
      ownerDocument.removeEventListener("mouseup", this.handleMouseUp, true);
    }

    start(tableFrom: number) {
      this.pointerState = { tableFrom };
    }

    private readonly handleMouseMove = (event: MouseEvent) => {
      if (!this.pointerState) {
        return;
      }

      const cellElement = getCellElementFromEventTarget(event.target);
      if (!cellElement) {
        return;
      }

      const cellData = getCellTargetData(cellElement);
      if (!cellData || cellData.tableFrom !== this.pointerState.tableFrom) {
        return;
      }

      setOrExtendCellSelectionToCoords(
        activeCellToCoords(cellData),
        cellData.tableFrom,
        this.view,
      );
    };

    private readonly handleMouseUp = () => {
      this.pointerState = null;
    };
  },
);

const tableInteractionHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target;
    const cellElement = getCellElementFromEventTarget(target);
    if (cellElement) {
      const nextActiveCell = getCellTargetData(cellElement);
      if (!nextActiveCell) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }

      if (event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        tableSelectionPointers.get(view)?.start(nextActiveCell.tableFrom);
        setOrExtendCellSelectionToCoords(
          activeCellToCoords(nextActiveCell),
          nextActiveCell.tableFrom,
          view,
        );
        return true;
      }

      event.preventDefault();
      event.stopPropagation();

      rememberPendingTableCellOpen(view, nextActiveCell, "end");
      pendingTableCellOpens.get(view)!.clickCoords = {
        x: event.clientX,
        y: event.clientY,
      };

      dispatchActiveTableCellSelection(nextActiveCell, view);
      return true;
    }

    clearTableInteractionState(target, view);
    return false;
  },
});

export function tables(): Extension {
  const [undoScrollCapturePlugin, undoScrollPreservation] =
    createUndoScrollPreservation();
  return [
    activeTableCellField,
    cellSelectionField,
    resolvedActiveTableCellField,
    tableDecorationField,
    activeTableCellGuard,
    undoScrollCapturePlugin,
    undoScrollPreservation,
    cellSelectionClipboardHandlers,
    cellSelectionKeymap,
    cellSelectionVisualsPlugin,
    tableInteractionHandlers,
    tableSelectionPointerPlugin,
    nestedTableEditorPlugin,
  ];
}
