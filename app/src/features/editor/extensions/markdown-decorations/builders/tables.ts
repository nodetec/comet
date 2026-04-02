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

type TableAlignment = "center" | "left" | "right" | null;
type TableSection = "header" | "body";

type TableCellRange = {
  editableFrom: number;
  editableTo: number;
  from: number;
  to: number;
};

type ParsedMarkdownTable = {
  alignments: TableAlignment[];
  bodyRows: string[][];
  cellRanges: {
    headers: TableCellRange[];
    rows: TableCellRange[][];
  };
  headerCells: string[];
};

type ResolvedTable = {
  table: ParsedMarkdownTable;
  tableFrom: number;
  tableTo: number;
};

type ResolvedActiveCell = {
  activeCell: ActiveTableCell;
  editableFrom: number;
  editableTo: number;
  table: ParsedMarkdownTable;
  tableFrom: number;
  tableTo: number;
  text: string;
};

type ActiveTableCell = {
  col: number;
  row: number;
  section: TableSection;
  tableFrom: number;
};

type LocalSelection = {
  anchor: number;
  head: number;
};

const ACTIVE_CELL_HOST_CLASS = "cm-md-table-cell-editor";
const CELL_CLASS = "cm-md-table-cell";
const CELL_CONTENT_CLASS = "cm-md-table-cell-content";
const SECTION_ATTR = "data-table-section";
const ROW_ATTR = "data-table-row";
const COL_ATTR = "data-table-col";
const TABLE_FROM_ATTR = "data-table-from";
const NON_CANONICAL_BR_PATTERN = /<br\s*\/>/gi;
const LINE_BREAK_PATTERN = /\r\n|\n|\r/g;
const UNESCAPED_PIPE_PATTERN = /(?<!\\)(\\\\)*\|/g;

const setActiveTableCellEffect = StateEffect.define<ActiveTableCell>();
const clearActiveTableCellEffect = StateEffect.define<void>();
const syncTableEditAnnotation = Annotation.define<boolean>();

function isSameActiveTableCell(
  left: ActiveTableCell | null,
  right: ActiveTableCell | null,
): boolean {
  return (
    left?.tableFrom === right?.tableFrom &&
    left?.section === right?.section &&
    left?.row === right?.row &&
    left?.col === right?.col
  );
}

const activeTableCellField = StateField.define<ActiveTableCell | null>({
  create() {
    return null;
  },
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(clearActiveTableCellEffect)) {
        return null;
      }

      if (effect.is(setActiveTableCellEffect)) {
        return effect.value;
      }
    }

    if (!value || !transaction.docChanged) {
      return value;
    }

    return {
      ...value,
      tableFrom: transaction.changes.mapPos(value.tableFrom, 1),
    };
  },
});

function getActiveTableCell(state: EditorState): ActiveTableCell | null {
  return state.field(activeTableCellField, false) ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeBrTags(text: string): string {
  return text.replace(NON_CANONICAL_BR_PATTERN, "<br>");
}

function unsanitizeRootText(rootText: string): string {
  return rootText
    .split("<br>")
    .join("\n")
    .split(String.raw`\|`)
    .join("|");
}

function sanitizeLocalText(localText: string): string {
  return normalizeBrTags(localText)
    .replace(LINE_BREAK_PATTERN, "<br>")
    .replace(UNESCAPED_PIPE_PATTERN, String.raw`\$&`);
}

function clampSelection(
  selection: LocalSelection,
  textLength: number,
): LocalSelection {
  return {
    anchor: clamp(selection.anchor, 0, textLength),
    head: clamp(selection.head, 0, textLength),
  };
}

function getTrimBounds(line: string) {
  let from = 0;
  let to = line.length;

  while (from < to && /\s/u.test(line[from] ?? "")) {
    from += 1;
  }
  while (to > from && /\s/u.test(line[to - 1] ?? "")) {
    to -= 1;
  }

  return { from, to };
}

function trimCellBounds(line: string, from: number, to: number) {
  let start = from;
  let end = to;

  while (start < end && /\s/u.test(line[start] ?? "")) {
    start += 1;
  }
  while (end > start && /\s/u.test(line[end - 1] ?? "")) {
    end -= 1;
  }

  if (start === end) {
    const insertion = Math.min(from + 1, to);
    return { from: insertion, to: insertion };
  }

  return { from: start, to: end };
}

function editableCellBounds(line: string, from: number, to: number) {
  let start = from;
  let end = to;

  if (start < end && /\s/u.test(line[start] ?? "")) {
    start += 1;
  }
  if (end > start && /\s/u.test(line[end - 1] ?? "")) {
    end -= 1;
  }

  if (start === end && from < to) {
    const insertion = Math.min(from + 1, to);
    return { from: insertion, to: insertion };
  }

  return { from: start, to: end };
}

function getNonEmptyLinesWithOffsets(text: string) {
  const result: Array<{ from: number; line: string }> = [];
  const lines = text.split("\n");
  let offset = 0;

  for (const [index, line] of lines.entries()) {
    if (line.trim().length > 0) {
      result.push({ from: offset, line });
    }
    offset += line.length;
    if (index < lines.length - 1) {
      offset += 1;
    }
  }

  return result;
}

function scanMarkdownTableRow(line: string) {
  const delimiters: number[] = [];
  let escaped = false;

  for (const [index, character] of [...line].entries()) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "|") {
      delimiters.push(index);
    }
  }

  return { delimiters };
}

function lastDelimiter(delimiters: number[]) {
  const lastIndex = delimiters.length - 1;
  return lastIndex >= 0 ? delimiters[lastIndex] : Number.NaN;
}

function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("-") && /^[\s|:-]+$/u.test(trimmed);
}

function parseSeparatorRow(line: string): string[] {
  const trimmed = line.trim();
  const { delimiters: allDelimiters } = scanMarkdownTableRow(trimmed);

  let innerFrom = 0;
  let innerTo = trimmed.length;
  if (allDelimiters[0] === 0) {
    innerFrom += 1;
  }
  if (lastDelimiter(allDelimiters) === trimmed.length - 1) {
    innerTo -= 1;
  }

  const delimiters = allDelimiters.filter(
    (index) => index > innerFrom && index < innerTo,
  );

  const cells: string[] = [];
  let segmentStart = innerFrom;
  for (const delimiterIndex of delimiters) {
    cells.push(trimmed.slice(segmentStart, delimiterIndex).trim());
    segmentStart = delimiterIndex + 1;
  }
  cells.push(trimmed.slice(segmentStart, innerTo).trim());

  return cells;
}

function parseAlignment(cell: string): TableAlignment {
  const trimmed = cell.trim();
  const startsWithColon = trimmed.startsWith(":");
  const endsWithColon = trimmed.endsWith(":");

  if (startsWithColon && endsWithColon) {
    return "center";
  }
  if (startsWithColon) {
    return "left";
  }
  if (endsWithColon) {
    return "right";
  }
  return null;
}

function parseLineCellRanges(line: string, lineFromInTable: number) {
  const { from: trimFrom, to: trimTo } = getTrimBounds(line);
  if (trimTo <= trimFrom) {
    return [];
  }

  const { delimiters: allDelimiters } = scanMarkdownTableRow(line);
  let innerFrom = trimFrom;
  let innerTo = trimTo;

  if (allDelimiters[0] === trimFrom) {
    innerFrom += 1;
  }
  if (lastDelimiter(allDelimiters) === trimTo - 1) {
    innerTo -= 1;
  }

  const delimiters = allDelimiters.filter(
    (index) => index > innerFrom && index < innerTo,
  );

  const ranges: TableCellRange[] = [];
  let segmentStart = innerFrom;

  for (const delimiterIndex of delimiters) {
    const trimmed = trimCellBounds(line, segmentStart, delimiterIndex);
    const editable = editableCellBounds(line, segmentStart, delimiterIndex);
    ranges.push({
      editableFrom: lineFromInTable + editable.from,
      editableTo: lineFromInTable + editable.to,
      from: lineFromInTable + trimmed.from,
      to: lineFromInTable + trimmed.to,
    });
    segmentStart = delimiterIndex + 1;
  }

  const trimmed = trimCellBounds(line, segmentStart, innerTo);
  const editable = editableCellBounds(line, segmentStart, innerTo);
  ranges.push({
    editableFrom: lineFromInTable + editable.from,
    editableTo: lineFromInTable + editable.to,
    from: lineFromInTable + trimmed.from,
    to: lineFromInTable + trimmed.to,
  });

  return ranges;
}

function parseMarkdownTable(markdown: string): ParsedMarkdownTable | null {
  const lines = getNonEmptyLinesWithOffsets(markdown);
  if (lines.length < 2) {
    return null;
  }

  const headerLine = lines[0];
  const separatorLine = lines[1];
  if (
    !headerLine?.line.includes("|") ||
    !separatorLine ||
    !isSeparatorRow(separatorLine.line)
  ) {
    return null;
  }

  const headers = parseLineCellRanges(headerLine.line, headerLine.from);
  const alignments = parseSeparatorRow(separatorLine.line).map(parseAlignment);
  const rows: TableCellRange[][] = [];
  for (const lineInfo of lines.slice(2)) {
    if (lineInfo.line.includes("|")) {
      rows.push(parseLineCellRanges(lineInfo.line, lineInfo.from));
    }
  }

  const headerCells = headers.map((range) =>
    markdown.slice(range.from, range.to),
  );
  const bodyRows = rows.map((row) =>
    row.map((range) => markdown.slice(range.from, range.to)),
  );

  const columnCount = Math.max(
    headerCells.length,
    alignments.length,
    ...bodyRows.map((row) => row.length),
  );

  return {
    alignments: Array.from(
      { length: columnCount },
      (_, index) => alignments[index] ?? null,
    ),
    bodyRows: Array.from(bodyRows, (row) =>
      Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
    ),
    cellRanges: {
      headers: Array.from({ length: columnCount }, (_, index) => {
        const range = headers[index];
        return (
          range ?? {
            editableFrom: headerLine.from + headerLine.line.length,
            editableTo: headerLine.from + headerLine.line.length,
            from: headerLine.from + headerLine.line.length,
            to: headerLine.from + headerLine.line.length,
          }
        );
      }),
      rows: Array.from(bodyRows, (_row, rowIndex) => {
        const ranges = rows[rowIndex] ?? [];
        const lineInfo = lines[rowIndex + 2];
        const fallback =
          lineInfo == null
            ? separatorLine
            : {
                from: lineInfo.from + lineInfo.line.length,
                line: lineInfo.line,
              };
        return Array.from({ length: columnCount }, (_, index) => {
          const range = ranges[index];
          return (
            range ?? {
              editableFrom: fallback.from,
              editableTo: fallback.from,
              from: fallback.from,
              to: fallback.from,
            }
          );
        });
      }),
    },
    headerCells: Array.from(
      { length: columnCount },
      (_, index) => headerCells[index] ?? "",
    ),
  };
}

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
): ResolvedActiveCell | null {
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
  resolved: ResolvedActiveCell | null,
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
  private resolved: ResolvedActiveCell | null = null;

  open(
    mainView: EditorView,
    resolved: ResolvedActiveCell,
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
    tableInteractionHandlers,
    nestedTableEditorPlugin,
  ];
}
