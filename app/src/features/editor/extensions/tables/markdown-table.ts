import {
  computeMarkdownTableCellRanges,
  isSeparatorRow,
  parseSeparatorRow,
} from "@/features/editor/extensions/tables/markdown-table-cell-ranges";
import type {
  ParsedMarkdownTable,
  TableAlignment,
  TableSection,
} from "@/features/editor/extensions/tables/types";
import type {
  CellCoords,
  TableRect,
} from "@/features/editor/extensions/tables/cell-selection-state";

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

function createParsedMarkdownTable(
  markdown: string,
): ParsedMarkdownTable | null {
  const lines = markdown.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return null;
  }

  const headerLine = lines[0];
  const separatorLine = lines[1];
  if (
    !headerLine?.includes("|") ||
    !separatorLine ||
    !isSeparatorRow(separatorLine)
  ) {
    return null;
  }

  const cellRanges = computeMarkdownTableCellRanges(markdown);
  if (!cellRanges) {
    return null;
  }

  const alignments = parseSeparatorRow(separatorLine).map(parseAlignment);
  const headerCells = cellRanges.headers.map((range) =>
    markdown.slice(range.from, range.to),
  );
  const bodyRows = cellRanges.rows.map((row) =>
    row.map((range) => markdown.slice(range.from, range.to)),
  );

  const columnCount = Math.max(
    headerCells.length,
    alignments.length,
    ...bodyRows.map((row) => row.length),
  );

  const fallbackRange = {
    editableFrom: markdown.length,
    editableTo: markdown.length,
    from: markdown.length,
    to: markdown.length,
  };

  return {
    alignments: Array.from(
      { length: columnCount },
      (_, index) => alignments[index] ?? null,
    ),
    bodyRows: bodyRows.map((row) =>
      Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
    ),
    cellRanges: {
      headers: Array.from(
        { length: columnCount },
        (_, index) => cellRanges.headers[index] ?? fallbackRange,
      ),
      rows: bodyRows.map((_row, rowIndex) => {
        const rowRanges = cellRanges.rows[rowIndex] ?? [];
        return Array.from(
          { length: columnCount },
          (_, index) => rowRanges[index] ?? fallbackRange,
        );
      }),
    },
    headerCells: Array.from(
      { length: columnCount },
      (_, index) => headerCells[index] ?? "",
    ),
  };
}

function normalizeTableData(
  alignments: readonly TableAlignment[],
  bodyRows: readonly string[][],
  headerCells: readonly string[],
): ParsedMarkdownTable {
  const columnCount = Math.max(
    headerCells.length,
    alignments.length,
    ...bodyRows.map((row) => row.length),
  );

  const fallbackRange = {
    editableFrom: 0,
    editableTo: 0,
    from: 0,
    to: 0,
  };

  return {
    alignments: Array.from(
      { length: columnCount },
      (_, index) => alignments[index] ?? null,
    ),
    bodyRows: bodyRows.map((row) =>
      Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
    ),
    cellRanges: {
      headers: Array.from({ length: columnCount }, () => fallbackRange),
      rows: bodyRows.map(() =>
        Array.from({ length: columnCount }, () => fallbackRange),
      ),
    },
    headerCells: Array.from(
      { length: columnCount },
      (_, index) => headerCells[index] ?? "",
    ),
  };
}

function separatorCellForAlignment(align: TableAlignment): string {
  if (align === "center") {
    return ":---:";
  }
  if (align === "left") {
    return ":---";
  }
  if (align === "right") {
    return "---:";
  }
  return "---";
}

function joinRow(cells: readonly string[]) {
  return `| ${cells.join(" | ")} |`;
}

export class MarkdownTable {
  private constructor(private readonly data: ParsedMarkdownTable) {}

  static fromParts(input: {
    alignments: readonly TableAlignment[];
    bodyRows: readonly string[][];
    headerCells: readonly string[];
  }): MarkdownTable {
    return new MarkdownTable(
      normalizeTableData(input.alignments, input.bodyRows, input.headerCells),
    );
  }

  static parse(markdown: string): MarkdownTable | null {
    const parsed = createParsedMarkdownTable(markdown);
    return parsed ? new MarkdownTable(parsed) : null;
  }

  get alignments(): readonly TableAlignment[] {
    return [...this.data.alignments];
  }

  get bodyRows(): readonly string[][] {
    return this.data.bodyRows.map((row) => [...row]);
  }

  get cellRanges() {
    return this.data.cellRanges;
  }

  get columnCount(): number {
    return this.data.headerCells.length;
  }

  get headerCells(): readonly string[] {
    return [...this.data.headerCells];
  }

  get rowCount(): number {
    return 1 + this.data.bodyRows.length;
  }

  deleteColumn(col: number): MarkdownTable {
    if (this.columnCount <= 1 || col < 0 || col >= this.columnCount) {
      return this;
    }

    return new MarkdownTable({
      ...this.data,
      alignments: this.data.alignments.filter((_, index) => index !== col),
      bodyRows: this.data.bodyRows.map((row) =>
        row.filter((_, index) => index !== col),
      ),
      headerCells: this.data.headerCells.filter((_, index) => index !== col),
    });
  }

  deleteRowAt(section: TableSection, row: number): MarkdownTable {
    if (section === "header") {
      const [nextHeader, ...remainingRows] = this.data.bodyRows;
      if (!nextHeader) {
        return this;
      }

      return new MarkdownTable({
        ...this.data,
        bodyRows: remainingRows,
        headerCells: [...nextHeader],
      });
    }

    if (row < 0 || row >= this.data.bodyRows.length) {
      return this;
    }

    return new MarkdownTable({
      ...this.data,
      bodyRows: this.data.bodyRows.filter((_, index) => index !== row),
    });
  }

  insertColumn(col: number, where: "after" | "before"): MarkdownTable {
    const targetIndex = where === "before" ? col : col + 1;
    const actualIndex = Math.max(0, Math.min(targetIndex, this.columnCount));

    const insertEmptyCell = (row: readonly string[]) => {
      const nextRow = [...row];
      nextRow.splice(actualIndex, 0, "");
      return nextRow;
    };

    return new MarkdownTable({
      ...this.data,
      alignments: [
        ...this.data.alignments.slice(0, actualIndex),
        null,
        ...this.data.alignments.slice(actualIndex),
      ],
      bodyRows: this.data.bodyRows.map(insertEmptyCell),
      headerCells: insertEmptyCell(this.data.headerCells),
    });
  }

  insertRowRelativeTo(
    section: TableSection,
    row: number,
    where: "after" | "before",
  ): MarkdownTable {
    if (section === "header") {
      if (where === "after") {
        return new MarkdownTable({
          ...this.data,
          bodyRows: [
            Array.from({ length: this.columnCount }, () => ""),
            ...this.data.bodyRows.map((bodyRow) => [...bodyRow]),
          ],
        });
      }

      return new MarkdownTable({
        ...this.data,
        bodyRows: [
          [...this.data.headerCells],
          ...this.data.bodyRows.map((bodyRow) => [...bodyRow]),
        ],
        headerCells: Array.from({ length: this.columnCount }, () => ""),
      });
    }

    const nextRows = this.data.bodyRows.map((bodyRow) => [...bodyRow]);
    const emptyRow = Array.from({ length: this.columnCount }, () => "");
    const targetIndex = Math.max(0, where === "before" ? row : row + 1);
    nextRows.splice(targetIndex, 0, emptyRow);

    return new MarkdownTable({
      ...this.data,
      bodyRows: nextRows,
    });
  }

  clearRect(rect: TableRect): MarkdownTable {
    if (
      rect.minCol < 0 ||
      rect.minRow < 0 ||
      rect.maxCol >= this.columnCount ||
      rect.maxRow >= this.rowCount ||
      rect.minCol > rect.maxCol ||
      rect.minRow > rect.maxRow
    ) {
      return this;
    }

    const nextHeader = [...this.data.headerCells];
    const nextRows = this.data.bodyRows.map((row) => [...row]);
    let didChange = false;

    for (let row = rect.minRow; row <= rect.maxRow; row += 1) {
      for (let col = rect.minCol; col <= rect.maxCol; col += 1) {
        if (row === 0) {
          if (nextHeader[col] !== "") {
            nextHeader[col] = "";
            didChange = true;
          }
        } else if (nextRows[row - 1]?.[col] !== "") {
          nextRows[row - 1][col] = "";
          didChange = true;
        }
      }
    }

    return didChange
      ? new MarkdownTable({
          ...this.data,
          bodyRows: nextRows,
          headerCells: nextHeader,
        })
      : this;
  }

  pasteGrid(anchor: CellCoords, cells: string[][]): MarkdownTable {
    if (cells.length === 0 || cells[0]?.length === 0) {
      return this;
    }

    const anchorUnifiedRow = anchor.section === "header" ? 0 : anchor.row + 1;
    const requiredRows = anchorUnifiedRow + cells.length;
    const requiredCols = anchor.col + (cells[0]?.length ?? 0);

    let nextTable = MarkdownTable.fromParts({
      alignments: this.data.alignments,
      bodyRows: this.data.bodyRows,
      headerCells: this.data.headerCells,
    });
    while (nextTable.columnCount < requiredCols) {
      nextTable = nextTable.insertColumn(nextTable.columnCount - 1, "after");
    }
    while (nextTable.rowCount < requiredRows) {
      nextTable = nextTable.insertRowRelativeTo(
        "body",
        nextTable.bodyRows.length - 1,
        "after",
      );
    }

    const nextHeader = [...nextTable.headerCells];
    const nextRows = nextTable.bodyRows.map((row) => [...row]);

    for (const [rowOffset, row] of cells.entries()) {
      const targetUnifiedRow = anchorUnifiedRow + rowOffset;
      for (const [colOffset, value] of row.entries()) {
        const targetCol = anchor.col + colOffset;
        if (targetUnifiedRow === 0) {
          nextHeader[targetCol] = value;
        } else if (nextRows[targetUnifiedRow - 1]) {
          nextRows[targetUnifiedRow - 1][targetCol] = value;
        }
      }
    }

    return new MarkdownTable({
      ...nextTable.toParsed(),
      bodyRows: nextRows,
      headerCells: nextHeader,
    });
  }

  serialize(): string {
    const headerLine = joinRow(this.data.headerCells);
    const separatorLine = joinRow(
      this.data.alignments.map(separatorCellForAlignment),
    );
    const bodyLines = this.data.bodyRows.map((row) => joinRow(row));

    return [headerLine, separatorLine, ...bodyLines].join("\n");
  }

  toParsed(): ParsedMarkdownTable {
    return {
      alignments: [...this.data.alignments],
      bodyRows: this.data.bodyRows.map((row) => [...row]),
      cellRanges: {
        headers: [...this.data.cellRanges.headers],
        rows: this.data.cellRanges.rows.map((row) => [...row]),
      },
      headerCells: [...this.data.headerCells],
    };
  }
}

export function parseMarkdownTable(
  markdown: string,
): ParsedMarkdownTable | null {
  return MarkdownTable.parse(markdown)?.toParsed() ?? null;
}

export function getCanonicalTableTextIfChanged(
  table: Pick<ParsedMarkdownTable, "alignments" | "bodyRows" | "headerCells">,
  text: string,
) {
  const canonical = MarkdownTable.fromParts({
    alignments: table.alignments,
    bodyRows: table.bodyRows,
    headerCells: table.headerCells,
  }).serialize();

  return canonical === text ? null : canonical;
}
