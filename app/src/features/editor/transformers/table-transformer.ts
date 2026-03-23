import type { ElementTransformer } from "@lexical/markdown";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown";
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from "@lexical/table";
import { $isParagraphNode, $isTextNode, type LexicalNode } from "lexical";

const TABLE_ROW_REG_EXP = /^(?:\|)(.+)(?:\|)\s?$/;
const TABLE_ROW_DIVIDER_REG_EXP = /^(\| ?:?-+:? ?)+\|\s?$/;

let ALL_TRANSFORMERS: ElementTransformer[] = [];

export function setTableTransformers(transformers: ElementTransformer[]) {
  ALL_TRANSFORMERS = transformers;
}

const $createTableCell = (textContent: string): TableCellNode => {
  textContent = textContent.replace(/\\n/g, "\n");
  const cell = $createTableCellNode(TableCellHeaderStates.NO_STATUS);
  $convertFromMarkdownString(textContent, ALL_TRANSFORMERS, cell, true);
  return cell;
};

const mapToTableCells = (textContent: string): Array<TableCellNode> | null => {
  const match = TABLE_ROW_REG_EXP.exec(textContent);
  if (!match || !match[1]) {
    return null;
  }
  return match[1].split("|").map((text) => $createTableCell(text.trim()));
};

function getTableColumnsSize(table: TableNode) {
  const row = table.getFirstChild();
  return $isTableRowNode(row) ? row.getChildrenSize() : 0;
}

function handleTableDividerRow(parentNode: LexicalNode): boolean {
  const table = parentNode.getPreviousSibling();
  if (!table || !$isTableNode(table)) return false;

  const rows = table.getChildren();
  const lastRow = rows.at(-1);
  if (!lastRow || !$isTableRowNode(lastRow)) return false;

  for (const cell of lastRow.getChildren()) {
    if (!$isTableCellNode(cell)) continue;
    cell.setHeaderStyles(
      TableCellHeaderStates.ROW,
      TableCellHeaderStates.ROW,
    );
  }

  parentNode.remove();
  return true;
}

function collectPrecedingTableRows(
  parentNode: LexicalNode,
  initialCells: TableCellNode[],
): { rows: TableCellNode[][]; maxCells: number } {
  const rows = [initialCells];
  let sibling = parentNode.getPreviousSibling();
  let maxCells = initialCells.length;

  while (sibling) {
    if (!$isParagraphNode(sibling) || sibling.getChildrenSize() !== 1) break;

    const firstChild = sibling.getFirstChild();
    if (!$isTextNode(firstChild)) break;

    const cells = mapToTableCells(firstChild.getTextContent());
    if (cells == null) break;

    maxCells = Math.max(maxCells, cells.length);
    rows.unshift(cells);
    const previousSibling = sibling.getPreviousSibling();
    sibling.remove();
    sibling = previousSibling;
  }

  return { rows, maxCells };
}

function buildTableNode(
  rows: TableCellNode[][],
  maxCells: number,
): TableNode {
  const table = $createTableNode();
  for (const cells of rows) {
    const tableRow = $createTableRowNode();
    table.append(tableRow);
    for (let i = 0; i < maxCells; i++) {
      tableRow.append(i < cells.length ? cells[i] : $createTableCell(""));
    }
  }
  return table;
}

function padTableColumnsAndMerge(
  table: TableNode,
  parentNode: LexicalNode,
  maxCells: number,
): void {
  const previousSibling = parentNode.getPreviousSibling();
  const previousColumns = $isTableNode(previousSibling)
    ? getTableColumnsSize(previousSibling)
    : 0;
  const targetColumns = Math.max(previousColumns, maxCells);

  if (targetColumns > maxCells) {
    for (const row of table.getChildren()) {
      if (!$isTableRowNode(row)) continue;
      for (let i = row.getChildrenSize(); i < targetColumns; i++) {
        row.append($createTableCell(""));
      }
    }
  }

  if ($isTableNode(previousSibling) && previousColumns === targetColumns) {
    previousSibling.append(...table.getChildren());
    parentNode.remove();
  } else {
    parentNode.replace(table);
  }
}

export const TABLE: ElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node: LexicalNode) => {
    if (!$isTableNode(node)) {
      return null;
    }

    const output: string[] = [];

    for (const row of node.getChildren()) {
      const rowOutput: string[] = [];
      if (!$isTableRowNode(row)) {
        continue;
      }

      let isHeaderRow = false;
      for (const cell of row.getChildren()) {
        if ($isTableCellNode(cell)) {
          rowOutput.push(
            $convertToMarkdownString(ALL_TRANSFORMERS, cell, false)
              .replace(/\n+/g, "\n")
              .replace(/\n/g, String.raw`\n`)
              .trim(),
          );
          if (cell.__headerState === TableCellHeaderStates.ROW) {
            isHeaderRow = true;
          }
        }
      }

      output.push(`| ${rowOutput.join(" | ")} |`);
      if (isHeaderRow) {
        output.push(`| ${rowOutput.map(() => "---").join(" | ")} |`);
      }
    }

    return output.join("\n");
  },
  regExp: TABLE_ROW_REG_EXP,
  replace: (parentNode, _1, match) => {
    if (TABLE_ROW_DIVIDER_REG_EXP.test(match[0])) {
      handleTableDividerRow(parentNode);
      return;
    }

    const matchCells = mapToTableCells(match[0]);
    if (matchCells == null) return;

    const { rows, maxCells } = collectPrecedingTableRows(
      parentNode,
      matchCells,
    );

    const table = buildTableNode(rows, maxCells);
    padTableColumnsAndMerge(table, parentNode, maxCells);
    table.selectEnd();
  },
  type: "element",
};
