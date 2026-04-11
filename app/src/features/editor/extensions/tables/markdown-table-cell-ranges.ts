import type { TableCellRange } from "@/features/editor/extensions/tables/types";

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
  const result: { from: number; line: string }[] = [];
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

export function scanMarkdownTableRow(line: string) {
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

export function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("-") && /^[\s|:-]+$/u.test(trimmed);
}

export function parseSeparatorRow(line: string): string[] {
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

export function computeMarkdownTableCellRanges(text: string) {
  const lines = getNonEmptyLinesWithOffsets(text);
  if (lines.length < 2) {
    return null;
  }

  const headerLine = lines[0];
  const separatorLine = lines[1];

  if (!headerLine?.line.includes("|") || !separatorLine) {
    return null;
  }
  if (!isSeparatorRow(separatorLine.line)) {
    return null;
  }

  const headers = parseLineCellRanges(headerLine.line, headerLine.from);
  const rows: TableCellRange[][] = [];

  for (const lineInfo of lines.slice(2)) {
    if (lineInfo.line.includes("|")) {
      rows.push(parseLineCellRanges(lineInfo.line, lineInfo.from));
    }
  }

  return { headers, rows };
}
