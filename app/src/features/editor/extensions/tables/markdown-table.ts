import {
  computeMarkdownTableCellRanges,
  isSeparatorRow,
  parseSeparatorRow,
} from "@/features/editor/extensions/tables/markdown-table-cell-ranges";
import type {
  ParsedMarkdownTable,
  TableAlignment,
} from "@/features/editor/extensions/tables/types";

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

export function parseMarkdownTable(
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
      headers: Array.from({ length: columnCount }, (_, index) => {
        return cellRanges.headers[index] ?? fallbackRange;
      }),
      rows: bodyRows.map((_row, rowIndex) => {
        const rowRanges = cellRanges.rows[rowIndex] ?? [];
        return Array.from({ length: columnCount }, (_, index) => {
          return rowRanges[index] ?? fallbackRange;
        });
      }),
    },
    headerCells: Array.from(
      { length: columnCount },
      (_, index) => headerCells[index] ?? "",
    ),
  };
}
