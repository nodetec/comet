import { syntaxTree } from "@codemirror/language";
import {
  Annotation,
  EditorSelection,
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
} from "@codemirror/state";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { redo, undo } from "@codemirror/commands";
import {
  Decoration,
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
  unsanitizeRootText,
} from "@/features/editor/extensions/tables/text-codec";
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
const normalizeBeforeEditAnnotation = Annotation.define<boolean>();
const syncTableEditAnnotation = Annotation.define<boolean>();

type PendingCursorPosition = "end" | "lastLineStart" | "start";

type PendingTableCellOpen = {
  activeCell: ActiveTableCell;
  cursorPos: PendingCursorPosition;
};

type TableOperationTarget = Pick<ActiveTableCell, "col" | "row" | "section">;

const pendingTableCellOpens = new WeakMap<EditorView, PendingTableCellOpen>();
const pendingTableNormalizations = new WeakSet<EditorView>();
const pendingTableFocusRestores = new WeakMap<EditorView, number>();
const tableHeightCache = new Map<string, number>();
const tableResizeObservers = new WeakMap<HTMLElement, ResizeObserver>();

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

function runTableOperationAtCell(
  activeCell: ActiveTableCell,
  computeTargetCell: (cell: ActiveTableCell) => TableOperationTarget,
  cursorPos: PendingCursorPosition,
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
    selection: EditorSelection.cursor(
      resolved.resolvedTable.tableFrom + nextRange.editableFrom,
    ),
    effects: setActiveTableCellEffect.of(nextActiveCell),
    scrollIntoView: false,
  });
  return true;
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

  const rect = button.getBoundingClientRect();
  const canDeleteColumn = resolved.markdownTable.columnCount > 1;
  const canDeleteRow =
    activeCell.section !== "header" ||
    resolved.markdownTable.bodyRows.length > 0;
  let shouldRefocusEditor = false;
  const menu = await Menu.new({
    items: [
      {
        id: "table-row-above",
        text: "Insert Row Above",
        action: () => {
          shouldRefocusEditor ||= runTableOperationAtCell(
            activeCell,
            (currentCell) => ({
              col: currentCell.col,
              row: currentCell.section === "header" ? 0 : currentCell.row,
              section: currentCell.section === "header" ? "header" : "body",
            }),
            "start",
            (table, currentCell) =>
              table.insertRowRelativeTo(
                currentCell.section,
                currentCell.row,
                "before",
              ),
            view,
          );
        },
      },
      {
        id: "table-row-below",
        text: "Insert Row Below",
        action: () => {
          shouldRefocusEditor ||= runTableOperationAtCell(
            activeCell,
            (currentCell) => ({
              col: currentCell.col,
              row: currentCell.section === "header" ? 0 : currentCell.row + 1,
              section: "body",
            }),
            "start",
            (table, currentCell) =>
              table.insertRowRelativeTo(
                currentCell.section,
                currentCell.row,
                "after",
              ),
            view,
          );
        },
      },
      await PredefinedMenuItem.new({ item: "Separator" }),
      {
        id: "table-column-left",
        text: "Insert Column Left",
        action: () => {
          shouldRefocusEditor ||= runTableOperationAtCell(
            activeCell,
            (currentCell) => ({
              col: currentCell.col,
              row: currentCell.row,
              section: currentCell.section,
            }),
            "start",
            (table, currentCell) =>
              table.insertColumn(currentCell.col, "before"),
            view,
          );
        },
      },
      {
        id: "table-column-right",
        text: "Insert Column Right",
        action: () => {
          shouldRefocusEditor ||= runTableOperationAtCell(
            activeCell,
            (currentCell) => ({
              col: currentCell.col + 1,
              row: currentCell.row,
              section: currentCell.section,
            }),
            "start",
            (table, currentCell) =>
              table.insertColumn(currentCell.col, "after"),
            view,
          );
        },
      },
      await PredefinedMenuItem.new({ item: "Separator" }),
      {
        id: "table-delete-row",
        text: "Delete Row",
        enabled: canDeleteRow,
        action: () => {
          shouldRefocusEditor ||= runTableOperationAtCell(
            activeCell,
            (currentCell) => ({
              col: currentCell.col,
              row:
                currentCell.section === "header"
                  ? 0
                  : Math.max(0, currentCell.row - 1),
              section: currentCell.section === "header" ? "header" : "body",
            }),
            "start",
            (table, currentCell) =>
              table.deleteRowAt(currentCell.section, currentCell.row),
            view,
          );
        },
      },
      {
        id: "table-delete-column",
        text: "Delete Column",
        enabled: canDeleteColumn,
        action: () => {
          shouldRefocusEditor ||= runTableOperationAtCell(
            activeCell,
            (currentCell) => ({
              col: Math.max(0, currentCell.col - 1),
              row: currentCell.row,
              section: currentCell.section,
            }),
            "start",
            (table, currentCell) => table.deleteColumn(currentCell.col),
            view,
          );
        },
      },
    ],
  });

  try {
    await menu.popup(new LogicalPosition(rect.left, rect.bottom));
  } finally {
    await menu.close();
    if (shouldRefocusEditor) {
      requestTableEditorFocusRestore(view);
    }
  }
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

  override ignoreEvent(): boolean {
    return false;
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
      view.dispatch({
        selection: EditorSelection.cursor(this.tableTo, -1),
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
      return decorations;
    }

    const resolved = getResolvedActiveTableCell(transaction.startState);
    if (
      transaction.annotation(syncTableEditAnnotation) &&
      transactionTouchesOnlyActiveCell(transaction, resolved)
    ) {
      return decorations.map(transaction.changes);
    }

    return buildTableDecorations(transaction.state);
  },
  provide(field) {
    return [EditorView.decorations.from(field)];
  },
});

const activeTableCellGuard = EditorState.transactionExtender.of(
  (transaction: Transaction) => {
    if (
      !transaction.docChanged ||
      transaction.annotation(syncTableEditAnnotation) ||
      transaction.annotation(normalizeBeforeEditAnnotation)
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
) {
  pendingTableCellOpens.set(view, {
    activeCell,
    cursorPos,
  });
}

function consumePendingTableCellOpen(
  view: EditorView,
  activeCell: ActiveTableCell,
): PendingCursorPosition | null {
  const pending = pendingTableCellOpens.get(view);
  if (!pending) {
    return null;
  }

  if (!isSameActiveTableCell(pending.activeCell, activeCell)) {
    return null;
  }

  pendingTableCellOpens.delete(view);
  return pending.cursorPos;
}

function peekPendingTableCellOpen(
  view: EditorView,
  activeCell: ActiveTableCell,
): PendingCursorPosition | null {
  const pending = pendingTableCellOpens.get(view);
  if (!pending || !isSameActiveTableCell(pending.activeCell, activeCell)) {
    return null;
  }

  return pending.cursorPos;
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
  view.dispatch({
    effects: setActiveTableCellEffect.of(nextActiveCell),
    scrollIntoView: false,
  });
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
  view: EditorView,
) {
  return runTableOperationAtCell(
    activeCell,
    computeTargetCell,
    cursorPos,
    operation,
    view,
  );
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
  ".cm-selectionBackground": {
    backgroundColor: "color-mix(in oklab, var(--primary) 22%, transparent)",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--editor-caret)",
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
    initialCursorPos: PendingCursorPosition = "end",
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
    let initialSelection = localText.length;
    if (initialCursorPos === "start") {
      initialSelection = 0;
    } else if (initialCursorPos === "lastLineStart") {
      initialSelection = localText.includes("\n")
        ? localText.lastIndexOf("\n") + 1
        : 0;
    }
    const state = EditorState.create({
      doc: localText,
      selection: EditorSelection.cursor(initialSelection),
      extensions: [
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
                ? startCellSelectionFromActiveCell("down", mainView)
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
                ? startCellSelectionFromActiveCell("left", mainView)
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
                ? startCellSelectionFromActiveCell("right", mainView)
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
                ? startCellSelectionFromActiveCell("up", mainView)
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
                      col: cell.col,
                      row: cell.row,
                      section: cell.section,
                    }),
                    "start",
                    (table, cell) => table.insertColumn(cell.col, "before"),
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
                      col: cell.col + 1,
                      row: cell.row,
                      section: cell.section,
                    }),
                    "start",
                    (table, cell) => table.insertColumn(cell.col, "after"),
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
            run: () => redo(mainView),
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
            run: () => redo(mainView),
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
            run: () => undo(mainView),
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
    this.editor.focus();
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
    if (localText === this.editor.state.doc.toString()) {
      return;
    }

    this.applyingRootUpdate = true;
    const currentSelection = this.editor.state.selection.main;
    const nextSelection = clampSelection(
      {
        anchor: currentSelection.anchor,
        head: currentSelection.head,
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
    if (
      this.applyingRootUpdate ||
      !update.docChanged ||
      !this.mainView ||
      !this.resolved
    ) {
      return;
    }

    const rootText = sanitizeLocalText(update.state.doc.toString());
    if (rootText === this.resolved.text) {
      return;
    }

    this.mainView.dispatch({
      changes: {
        from: this.resolved.editableFrom,
        insert: rootText,
        to: this.resolved.editableTo,
      },
      annotations: syncTableEditAnnotation.of(true),
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
      this.editor.focus();
      return true;
    }

    return false;
  }

  hasFocus() {
    return (
      this.editor !== null && this.editor.dom.contains(document.activeElement)
    );
  }
}

const nestedEditors = new WeakMap<EditorView, NestedTableEditorController>();

function reopenAndFocusActiveTableCell(view: EditorView) {
  const controller = nestedEditors.get(view);
  const activeCell = getActiveTableCell(view.state);
  const resolved = getResolvedActiveTableCell(view.state);
  if (!controller || !activeCell || !resolved) {
    return false;
  }

  const cellElement = findActiveCellElement(view, resolved.activeCell);
  if (!cellElement) {
    return false;
  }

  if (controller.isOpenFor(resolved.activeCell, cellElement)) {
    controller.handleMainEditorUpdate(view);
  } else {
    controller.open(
      view,
      resolved,
      cellElement,
      consumePendingTableCellOpen(view, resolved.activeCell) ?? "end",
    );
  }

  return controller.focus();
}

function focusTableEditor(view: EditorView) {
  if (reopenAndFocusActiveTableCell(view)) {
    return;
  }

  view.focus();
}

function requestTableEditorFocusRestore(view: EditorView, attempts = 8) {
  pendingTableFocusRestores.set(view, attempts);

  const restore = () => {
    if (!view.dom.isConnected) {
      pendingTableFocusRestores.delete(view);
      return;
    }

    const remaining = pendingTableFocusRestores.get(view);
    if (!remaining) {
      return;
    }

    const controller = nestedEditors.get(view);
    if (controller?.hasFocus()) {
      pendingTableFocusRestores.delete(view);
      return;
    }

    focusTableEditor(view);

    if (remaining <= 1) {
      pendingTableFocusRestores.delete(view);
      return;
    }

    pendingTableFocusRestores.set(view, remaining - 1);
    requestAnimationFrame(restore);
  };

  requestAnimationFrame(restore);
}

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

  rememberPendingTableCellOpen(
    view,
    {
      ...activeCell,
      tableFrom: resolved.tableFrom,
    },
    peekPendingTableCellOpen(view, activeCell) ?? "end",
  );

  pendingTableNormalizations.add(view);
  requestAnimationFrame(() => {
    pendingTableNormalizations.delete(view);
    if (!view.dom.isConnected) {
      return;
    }

    view.dispatch({
      changes: {
        from: resolved.tableFrom,
        insert: canonicalText,
        to: resolved.tableTo,
      },
      effects: setActiveTableCellEffect.of({
        ...activeCell,
        tableFrom: resolved.tableFrom,
      }),
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
        this.sync();
      }
    }

    destroy() {
      this.controller.close();
      nestedEditors.delete(this.view);
    }

    private sync() {
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
              consumePendingTableCellOpen(this.view, resolved.activeCell) ??
                "end",
            );
          }
        });
        return;
      }

      if (this.controller.isOpenFor(resolved.activeCell, cellElement)) {
        this.controller.handleMainEditorUpdate(this.view);
        return;
      }

      this.controller.open(
        this.view,
        resolved,
        cellElement,
        consumePendingTableCellOpen(this.view, resolved.activeCell) ?? "end",
      );
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
    if (
      target instanceof HTMLElement &&
      target.closest(`.${ACTIVE_CELL_HOST_CLASS}`)
    ) {
      event.stopPropagation();
      return true;
    }

    const cellElement = getCellElementFromEventTarget(target);
    if (cellElement) {
      event.preventDefault();
      event.stopPropagation();

      const nextActiveCell = getCellTargetData(cellElement);
      if (!nextActiveCell) {
        return true;
      }

      if (event.shiftKey) {
        tableSelectionPointers.get(view)?.start(nextActiveCell.tableFrom);
        setOrExtendCellSelectionToCoords(
          activeCellToCoords(nextActiveCell),
          nextActiveCell.tableFrom,
          view,
        );
        return true;
      }

      if (
        isSameActiveTableCell(getActiveTableCell(view.state), nextActiveCell)
      ) {
        nestedEditors.get(view)?.handleMainEditorUpdate(view);
      } else {
        view.dispatch({
          effects: setActiveTableCellEffect.of(nextActiveCell),
        });
      }
      return true;
    }

    clearTableInteractionState(target, view);
    return false;
  },
});

export function tables(): Extension {
  return [
    activeTableCellField,
    cellSelectionField,
    resolvedActiveTableCellField,
    tableDecorationField,
    activeTableCellGuard,
    cellSelectionClipboardHandlers,
    cellSelectionKeymap,
    cellSelectionVisualsPlugin,
    tableInteractionHandlers,
    tableSelectionPointerPlugin,
    nestedTableEditorPlugin,
  ];
}
