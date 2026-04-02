export type TableAlignment = "center" | "left" | "right" | null;
export type TableSection = "header" | "body";

export type TableCellRange = {
  editableFrom: number;
  editableTo: number;
  from: number;
  to: number;
};

export type ParsedMarkdownTable = {
  alignments: TableAlignment[];
  bodyRows: string[][];
  cellRanges: {
    headers: TableCellRange[];
    rows: TableCellRange[][];
  };
  headerCells: string[];
};

export type ResolvedTable = {
  table: ParsedMarkdownTable;
  tableFrom: number;
  tableTo: number;
};

export type ActiveTableCell = {
  col: number;
  row: number;
  section: TableSection;
  tableFrom: number;
};

export type ResolvedActiveTableCell = {
  activeCell: ActiveTableCell;
  editableFrom: number;
  editableTo: number;
  table: ParsedMarkdownTable;
  tableFrom: number;
  tableTo: number;
  text: string;
};

export type LocalSelection = {
  anchor: number;
  head: number;
};
