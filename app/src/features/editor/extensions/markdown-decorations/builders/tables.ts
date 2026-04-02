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

import { parseMarkdownTable } from "@/features/editor/extensions/tables/markdown-table";
import {
  activeTableCellField,
  clearActiveTableCellEffect,
  getActiveTableCell,
  isSameActiveTableCell,
  setActiveTableCellEffect,
} from "@/features/editor/extensions/tables/state";
import {
  clampSelection,
  sanitizeLocalText,
  unsanitizeRootText,
} from "@/features/editor/extensions/tables/text-codec";
import type {
  ActiveTableCell,
  ParsedMarkdownTable,
  ResolvedActiveTableCell,
  ResolvedTable,
} from "@/features/editor/extensions/tables/types";

const ACTIVE_CELL_HOST_CLASS = "cm-md-table-cell-editor";
const CELL_CLASS = "cm-md-table-cell";
const CELL_CONTENT_CLASS = "cm-md-table-cell-content";
const SECTION_ATTR = "data-table-section";
const ROW_ATTR = "data-table-row";
const COL_ATTR = "data-table-col";
const TABLE_FROM_ATTR = "data-table-from";
const syncTableEditAnnotation = Annotation.define<boolean>();

function resolveTableByFrom(
  state: EditorState,
  tableFrom: number,
): ResolvedTable | null {
  let resolved: ResolvedTable | null = null;

  syntaxTree(state).iterate({
    enter(node: SyntaxNodeRef) {
      if (node.name !== "Table") {
        return;
      }

      if (node.from !== tableFrom) {
        return;
      }

      const markdown = state.sliceDoc(node.from, node.to);
      const table = parseMarkdownTable(markdown);
      if (!table) {
        return;
      }

      resolved = {
        table,
        tableFrom: node.from,
        tableTo: node.to,
      };
    },
  });

  return resolved;
}

function resolveActiveTableCell(
  state: EditorState,
  activeCell: ActiveTableCell | null,
): ResolvedActiveTableCell | null {
  if (!activeCell) {
    return null;
  }

  const resolvedTable = resolveTableByFrom(state, activeCell.tableFrom);
  if (!resolvedTable) {
    return null;
  }

  const range =
    activeCell.section === "header"
      ? resolvedTable.table.cellRanges.headers[activeCell.col]
      : resolvedTable.table.cellRanges.rows[activeCell.row]?.[activeCell.col];
  const text =
    activeCell.section === "header"
      ? resolvedTable.table.headerCells[activeCell.col]
      : resolvedTable.table.bodyRows[activeCell.row]?.[activeCell.col];

  if (!range || text == null) {
    return null;
  }

  return {
    activeCell: {
      ...activeCell,
      tableFrom: resolvedTable.tableFrom,
    },
    editableFrom: resolvedTable.tableFrom + range.editableFrom,
    editableTo: resolvedTable.tableFrom + range.editableTo,
    table: resolvedTable.table,
    tableFrom: resolvedTable.tableFrom,
    tableTo: resolvedTable.tableTo,
    text,
  };
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

class MarkdownTableWidget extends WidgetType {
  constructor(
    private readonly table: ParsedMarkdownTable,
    private readonly tableFrom: number,
    private readonly tableTo: number,
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof MarkdownTableWidget &&
      other.tableFrom === this.tableFrom &&
      other.tableTo === this.tableTo &&
      JSON.stringify(other.table) === JSON.stringify(this.table)
    );
  }

  override ignoreEvent(): boolean {
    return false;
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-md-table-wrapper";
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

    const activeCell = getActiveTableCell(transaction.startState);
    const resolved = resolveActiveTableCell(transaction.startState, activeCell);
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
      transaction.annotation(syncTableEditAnnotation)
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
    const state = EditorState.create({
      doc: localText,
      selection: EditorSelection.cursor(localText.length),
      extensions: [
        EditorView.lineWrapping,
        nestedTableEditorTheme,
        keymap.of([
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

    const resolved = resolveActiveTableCell(mainView.state, activeCell);
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
      this.cellElement.replaceChildren(
        createCellContentFromLocalText(
          localText ?? unsanitizeRootText(this.resolved?.text ?? ""),
        ),
      );
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
}

const nestedEditors = new WeakMap<EditorView, NestedTableEditorController>();

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

      const resolved = resolveActiveTableCell(this.view.state, activeCell);
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
            this.controller.open(this.view, resolved, nextElement);
          }
        });
        return;
      }

      if (this.controller.isOpenFor(resolved.activeCell, cellElement)) {
        this.controller.handleMainEditorUpdate(this.view);
        return;
      }

      this.controller.open(this.view, resolved, cellElement);
    }
  },
);

function getCellElementFromEventTarget(
  target: EventTarget | null,
): HTMLElement | null {
  return target instanceof HTMLElement
    ? target.closest(`.${CELL_CLASS}`)
    : null;
}

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

      const tableFrom = Number.parseInt(
        cellElement.getAttribute(TABLE_FROM_ATTR) ?? "",
        10,
      );
      const section = cellElement.getAttribute(SECTION_ATTR);
      const row = Number.parseInt(
        cellElement.getAttribute(ROW_ATTR) ?? "0",
        10,
      );
      const col = Number.parseInt(
        cellElement.getAttribute(COL_ATTR) ?? "0",
        10,
      );
      if (
        !Number.isFinite(tableFrom) ||
        (section !== "header" && section !== "body")
      ) {
        return true;
      }

      const nextActiveCell: ActiveTableCell = {
        col,
        row: section === "header" ? 0 : row,
        section,
        tableFrom,
      };

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

    if (
      getActiveTableCell(view.state) &&
      !(target instanceof HTMLElement && target.closest(".cm-md-table-wrapper"))
    ) {
      view.dispatch({
        effects: clearActiveTableCellEffect.of(),
      });
    }

    return false;
  },
});

export function tables(): Extension {
  return [
    activeTableCellField,
    tableDecorationField,
    activeTableCellGuard,
    tableInteractionHandlers,
    nestedTableEditorPlugin,
  ];
}
